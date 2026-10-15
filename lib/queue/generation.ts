import "server-only";
import type { RecipientIdentity } from "@/lib/ai/personalization";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { AppError, errorMessage } from "@/lib/errors";
import { generateBulk } from "@/lib/services/bulk";
import { getOwnedCampaign, refreshCampaignCounters } from "@/lib/services/campaigns";
import { logActivity } from "@/lib/services/logs";
import { runBulkJob } from "./bulk-generation";

export type GenerationMode = "missing" | "selected" | "regenerate_selected" | "failed";

const PEER_CACHE_MS = 60_000;

const state = globalThis as unknown as {
  __genInFlight?: Set<string>;
  __genPeers?: Map<string, { at: number; peers: RecipientIdentity[] }>;
};
const inFlight = (state.__genInFlight ??= new Set<string>());
const peerCache = (state.__genPeers ??= new Map());

/** The other recipients of a campaign (cached briefly; used for leakage checks). */
export async function campaignPeers(campaignId: string, fresh = false): Promise<RecipientIdentity[]> {
  const hit = peerCache.get(campaignId);
  if (!fresh && hit && Date.now() - hit.at < PEER_CACHE_MS) return hit.peers;
  const rows = await db().campaignContact.findMany({
    where: { campaignId },
    select: { id: true, contact: { select: { email: true, toPersonName: true, companyName: true } } },
  });
  const peers = rows.map((r) => ({ id: r.id, email: r.contact.email ?? "", name: r.contact.toPersonName, company: r.contact.companyName }));
  peerCache.set(campaignId, { at: Date.now(), peers });
  return peers;
}

/** Regenerates rows of a campaign (used by the review screen). */
export async function enqueueGeneration(userId: string, campaignId: string, mode: GenerationMode, ids?: string[]): Promise<number> {
  const campaign = await getOwnedCampaign(userId, campaignId);
  if (campaign.kind !== "BULK") throw new AppError("INVALID_STATE", "Only campaigns created in the send wizard can be generated.");
  peerCache.delete(campaignId);
  const res = await generateBulk(userId, campaignId, { mode: mode === "regenerate_selected" ? "selected" : mode, ids });
  return res.queued;
}

export async function pauseGeneration(userId: string, campaignId: string, reason?: string): Promise<void> {
  const campaign = await getOwnedCampaign(userId, campaignId);
  await db().campaign.update({ where: { id: campaign.id }, data: { generationPaused: true, generationPausedReason: reason ?? "Paused by user" } });
  await logActivity({ category: "AI_GENERATION", userId, campaignId, message: `Generation paused${reason ? `: ${reason}` : ""}` });
  await refreshCampaignCounters(campaignId);
}

async function claimJobs(limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const rows = await db().$queryRaw<{ id: string }[]>`
    UPDATE campaign_contacts
    SET status = 'GENERATING', locked_at = now(), generation_attempts = generation_attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT cc.id FROM campaign_contacts cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE cc.queued_for_generation = true
        AND c.kind = 'BULK'
        AND c.generation_paused = false
        AND c.status NOT IN ('RUNNING', 'SCHEDULED', 'COMPLETED')
        AND cc.status NOT IN ('GENERATING', 'SENDING', 'SENT', 'SKIPPED')
        AND (cc.next_attempt_at IS NULL OR cc.next_attempt_at <= now())
      ORDER BY cc.created_at ASC, cc.id ASC
      LIMIT ${limit}
      FOR UPDATE OF cc SKIP LOCKED
    )
    RETURNING id`;
  return rows.map((r) => r.id);
}

/** Called by the worker loop. Starts up to AI_CONCURRENCY jobs without blocking. */
export async function generationTick(onSettled: () => void): Promise<void> {
  const free = env().AI_CONCURRENCY - inFlight.size;
  const ids = await claimJobs(free);
  for (const id of ids) {
    inFlight.add(id);
    void runBulkJob(id)
      .catch((err) => console.error("[generation] job crashed", errorMessage(err)))
      .finally(() => {
        inFlight.delete(id);
        onSettled();
      });
  }
}

async function revertToQueue(ccId: string, hasEmail: boolean) {
  await db().campaignContact.updateMany({
    where: { id: ccId, status: "GENERATING" },
    data: { status: hasEmail ? "READY" : "NEW", lockedAt: null, queuedForGeneration: true },
  });
}

/** Resets jobs orphaned by a crash/restart back to the queue. */
export async function recoverStaleGeneration(maxAgeMs = 10 * 60 * 1000): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = await db().campaignContact.findMany({
    where: { status: "GENERATING", OR: [{ lockedAt: null }, { lockedAt: { lte: cutoff } }] },
    select: { id: true, currentEmailId: true },
  });
  for (const s of stale) {
    if (inFlight.has(s.id)) continue;
    await revertToQueue(s.id, Boolean(s.currentEmailId));
  }
}
