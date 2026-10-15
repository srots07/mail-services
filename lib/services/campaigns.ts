import "server-only";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import type { Campaign } from "@/lib/generated/prisma/client";
import type { CampaignStatus } from "@/lib/generated/prisma/enums";
import { logActivity } from "./logs";

export async function getOwnedCampaign(userId: string, campaignId: string): Promise<Campaign> {
  const campaign = await db().campaign.findFirst({ where: { id: campaignId, userId } });
  if (!campaign) throw new AppError("NOT_FOUND", "Campaign not found.");
  return campaign;
}

export async function deleteCampaign(userId: string, campaignId: string): Promise<void> {
  const campaign = await getOwnedCampaign(userId, campaignId);
  if (campaign.status === "RUNNING" || campaign.status === "SCHEDULED") {
    throw new AppError("INVALID_STATE", "Pause or cancel the campaign before deleting it.");
  }
  await db().campaign.delete({ where: { id: campaign.id } });
  await logActivity({ category: "CAMPAIGN_STATE", userId, message: `Campaign "${campaign.campaignName}" deleted` });
}

/**
 * Recomputes denormalised counters from campaign_contacts and settles derived states
 * (e.g. GENERATING -> READY_FOR_REVIEW once the generation queue drains).
 */
export async function refreshCampaignCounters(campaignId: string): Promise<Campaign | null> {
  const [total, generated, approved, sent, failed, generationActive] = await Promise.all([
    db().campaignContact.count({ where: { campaignId } }),
    db().campaignContact.count({ where: { campaignId, currentEmailId: { not: null } } }),
    db().campaignContact.count({ where: { campaignId, approvalStatus: "APPROVED", currentEmailId: { not: null } } }),
    db().campaignContact.count({ where: { campaignId, status: "SENT" } }),
    db().campaignContact.count({ where: { campaignId, status: "FAILED" } }),
    db().campaignContact.count({ where: { campaignId, OR: [{ queuedForGeneration: true }, { status: "GENERATING" }] } }),
  ]);
  const campaign = await db().campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;

  let status = campaign.status;
  let completedAt: Date | undefined;
  if (status === "GENERATING") {
    const stillRunning = generationActive > 0 && !campaign.generationPaused;
    const inFlight = await db().campaignContact.count({ where: { campaignId, status: "GENERATING" } });
    if (!stillRunning && inFlight === 0) status = generated > 0 ? "READY_FOR_REVIEW" : "DRAFT";
  }
  if (status === "SCHEDULED" || status === "RUNNING") {
    const pending = await db().campaignContact.count({ where: { campaignId, status: { in: ["SCHEDULED", "SENDING"] } } });
    if (pending === 0) {
      status = "COMPLETED";
      completedAt = new Date();
    }
  }

  const counters = { totalContacts: total, generatedCount: generated, approvedCount: approved, sentCount: sent, failedCount: failed };
  let changed = false;
  if (status !== campaign.status) {
    // Compare-and-set so a concurrent transition (e.g. SCHEDULED -> RUNNING) is never overwritten with a stale status.
    const res = await db().campaign.updateMany({ where: { id: campaignId, status: campaign.status }, data: { ...counters, status, completedAt } });
    changed = res.count > 0;
  }
  const updated = changed
    ? await db().campaign.findUniqueOrThrow({ where: { id: campaignId } })
    : await db().campaign.update({ where: { id: campaignId }, data: counters });
  if (changed) {
    await logActivity({
      category: "CAMPAIGN_STATE",
      userId: campaign.userId,
      campaignId,
      message: `Campaign status changed ${campaign.status} -> ${status}`,
    });
  }
  return updated;
}

/** Atomic compare-and-set status transition. Returns false if the campaign was not in an allowed state. */
export async function transitionCampaign(
  campaign: Pick<Campaign, "id" | "userId" | "status">,
  from: CampaignStatus[],
  to: CampaignStatus,
  extra: Record<string, unknown> = {},
  reason?: string,
): Promise<boolean> {
  const res = await db().campaign.updateMany({ where: { id: campaign.id, status: { in: from } }, data: { status: to, ...extra } });
  if (res.count === 0) return false;
  await logActivity({
    category: "CAMPAIGN_STATE",
    userId: campaign.userId,
    campaignId: campaign.id,
    message: `Campaign status changed ${campaign.status} -> ${to}${reason ? ` (${reason})` : ""}`,
  });
  return true;
}
