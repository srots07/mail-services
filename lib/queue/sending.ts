import "server-only";
import { validatePersonalization } from "@/lib/ai/personalization";
import { db, Prisma } from "@/lib/database/prisma";
import { providerForAccount } from "@/lib/email";
import { composeOutgoing } from "@/lib/email/compose";
import { describeProviderError, ProviderError, type EmailProvider } from "@/lib/email/provider";
import { env } from "@/lib/env";
import { AppError, errorMessage } from "@/lib/errors";
import type { Campaign, CampaignContact, Contact, EmailAccount, GeneratedEmail } from "@/lib/generated/prisma/client";
import { leftoverPlaceholders } from "@/lib/bulk/placeholders";
import { assertCanSend, licenseState } from "@/lib/license";
import { LICENSE_MESSAGES } from "@/lib/license-verify";
import { snapshotSender } from "@/lib/services/bulk";
import { getOwnedCampaign, refreshCampaignCounters, transitionCampaign } from "@/lib/services/campaigns";
import { logActivity, logActivityMany } from "@/lib/services/logs";
import { getActiveEmailAccount, getProviderSettings, getProviderStatus, type EmailChoice } from "@/lib/services/providers";
import { backoffDelay } from "./backoff";
import { campaignPeers } from "./generation";
import { computeSchedule, continueFrom, formatInterval, resolveStart, retryStart, zonedDateTimeToUtc } from "./schedule";

const state = globalThis as unknown as { __sendBusy?: boolean };

const DEFAULT_INTERVAL_SECONDS = 10;
const MAX_RATE_LIMIT_SHIFT_MS = 60 * 60 * 1000;

/** Recipients that may be scheduled: generated, individually approved, not yet sent. */
const READY_APPROVED = { status: "READY", approvalStatus: "APPROVED", currentEmailId: { not: null } } satisfies Prisma.CampaignContactWhereInput;
/** Failed sends (not generation failures) that still have an approved email. */
const SEND_FAILED = { status: "FAILED", approvalStatus: "APPROVED", currentEmailId: { not: null }, generationError: null } satisfies Prisma.CampaignContactWhereInput;

/* ----------------------------------------------------------------------------------------- */
/* Verification                                                                              */
/* ----------------------------------------------------------------------------------------- */

type VerifiableRecipient = CampaignContact & { contact: Contact; currentEmail: GeneratedEmail | null };

/**
 * One row = one email. Confirms the email being sent was generated for this exact row, is
 * addressed to this row's email address, and contains no other recipient's details.
 * Returns the problems found (empty = safe to send).
 */
type VerifyCampaign = Pick<Campaign, "id" | "kind" | "bulkBody" | "subjectTemplate" | "senderSnapshot">;

export async function verifyRecipient(cc: VerifiableRecipient, campaign: VerifyCampaign): Promise<string[]> {
  const problems: string[] = [];
  const email = cc.currentEmail;
  if (!email) return ["No generated email"];
  if (email.campaignContactId !== cc.id) problems.push("Email content belongs to a different recipient row");
  if (cc.approvalStatus !== "APPROVED") problems.push("Email is not approved");
  if (!cc.contact.email) return [...problems, "No recipient email address"];
  if (cc.contact.email !== cc.contact.email.trim().toLowerCase()) problems.push("Recipient email address is not normalised");
  if (campaign.kind !== "BULK") return [...problems, "Only campaigns created in the send wizard can be sent"];
  return [...problems, ...(await verifyBulkRow(cc, campaign))];
}

function extraValues(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === "string") : [];
}

/** Approved address, no unresolved placeholders, one email per address, no other recipient's details. */
async function verifyBulkRow(cc: VerifiableRecipient, campaign: VerifyCampaign): Promise<string[]> {
  const problems: string[] = [];
  const email = cc.currentEmail!;
  const to = cc.contact.email!;
  if (cc.emailSource === "MANUAL" && !cc.emailApprovedAt) problems.push("Recipient email was changed but not confirmed");
  if (cc.generationError) problems.push(`Unresolved problem: ${cc.generationError}`);
  if (!email.subject.trim()) problems.push("Subject is empty");
  if (!email.body.trim()) problems.push("Body is empty");
  const left = [...new Set([...leftoverPlaceholders(email.subject), ...leftoverPlaceholders(email.body)])];
  if (left.length) problems.push(`Unreplaced placeholders: ${left.join(", ")}`);
  const dup = await db().campaignContact.count({ where: { campaignId: campaign.id, id: { not: cc.id }, contact: { email: to }, status: { in: ["SCHEDULED", "SENDING", "SENT"] } } });
  if (dup) problems.push(`Another row of this campaign already sends to ${to}`);

  const sender = snapshotSender(campaign.senderSnapshot);
  const supplied = [campaign.bulkBody, campaign.subjectTemplate, cc.contact.fromPersonName, ...extraValues(cc.contact.customFields), ...Object.values(sender ?? {})].filter(Boolean).join("\n");
  const name = cc.contact.toPersonName ?? "";
  const company = cc.contact.companyName ?? "";
  const first = name.split(/\s+/)[0]?.toLowerCase() ?? "";
  const peers = await campaignPeers(campaign.id);
  const check = validatePersonalization(
    email,
    {
      id: cc.id,
      email: to,
      name: first && email.body.toLowerCase().includes(first) ? name : null,
      company,
      suppliedText: supplied,
      requireCompany: Boolean(company) && /\[\s*company(\s+name)?\s*\]/i.test(campaign.bulkBody ?? ""),
    },
    peers,
  );
  problems.push(...check.problems);
  return problems;
}

/* ----------------------------------------------------------------------------------------- */
/* Provider guard                                                                            */
/* ----------------------------------------------------------------------------------------- */

/** Provider for actual sends. The account must match the selected email provider: no silent fallback. */
function sendingProvider(account: EmailAccount, selected: EmailChoice): EmailProvider {
  const expected = selected === "mock" ? "MOCK" : selected === "smtp" ? "SMTP" : "GMAIL";
  if (account.provider !== expected) {
    throw new AppError(
      "NOT_CONFIGURED",
      `The email provider is set to ${selected.toUpperCase()} but this campaign's sender is ${account.provider}. Configure the sender in Settings, then resume.`,
    );
  }
  return providerForAccount(account);
}

async function requireSender(userId: string): Promise<{ account: EmailAccount; selected: EmailChoice }> {
  const settings = await getProviderSettings(userId);
  const account = await getActiveEmailAccount(userId, settings.email);
  if (!account) {
    throw new AppError(
      "NOT_CONFIGURED",
      settings.email === "gmail"
        ? "Connect Gmail in Settings before sending."
        : settings.email === "smtp"
          ? "Configure your direct SMTP sending mail in Settings before sending."
          : "Connect the mock sender in Settings before sending.",
    );
  }
  sendingProvider(account, settings.email);
  return { account, selected: settings.email };
}

/** Real sending requires a working Gmail grant; checked right before scheduling or resuming. */
async function requireConnectedEmail(userId: string): Promise<void> {
  const status = await getProviderStatus(userId);
  if (!status.email.connected) throw new AppError("NOT_CONFIGURED", `${status.email.label} is not ready: ${status.email.detail}`);
}

/* ----------------------------------------------------------------------------------------- */
/* Scheduling actions                                                                        */
/* ----------------------------------------------------------------------------------------- */

/** Assigns scheduled_at to each recipient in one statement (timestamps passed as UTC ISO strings). */
async function writeSchedule(tx: Prisma.TransactionClient, ids: string[], times: Date[], fromStatuses: string[]) {
  for (let i = 0; i < ids.length; i += 1000) {
    const idPart = ids.slice(i, i + 1000);
    const timePart = times.slice(i, i + 1000).map((t) => t.toISOString());
    await tx.$executeRaw`
      UPDATE campaign_contacts AS cc
      SET status = 'SCHEDULED', scheduled_at = (s.t::timestamptz AT TIME ZONE 'UTC'), locked_at = NULL,
          next_attempt_at = NULL, updated_at = now()
      FROM (SELECT unnest(${idPart}::text[]) AS id, unnest(${timePart}::text[]) AS t) AS s
      WHERE cc.id = s.id AND cc.status::text = ANY(${fromStatuses}::text[])`;
  }
}

function scheduleLogs(campaign: Pick<Campaign, "id" | "userId">, rows: { id: string; email: string }[], times: Date[], reason: string) {
  return logActivityMany(
    rows.map((r, i) => ({
      category: "EMAIL_SEND" as const,
      userId: campaign.userId,
      campaignId: campaign.id,
      message: `${reason}: ${r.email} at ${times[i].toISOString()}`,
      metadata: { recipientId: r.id, email: r.email, campaignId: campaign.id, scheduledAt: times[i].toISOString(), stage: "scheduled" },
    })),
  );
}

/** Marks approved recipients whose email fails verification as FAILED; returns the ones that pass. */
async function verifyForScheduling(campaign: Campaign, rows: VerifiableRecipient[]) {
  const passed: VerifiableRecipient[] = [];
  for (const r of rows) {
    const problems = await verifyRecipient(r, campaign);
    if (!problems.length) {
      passed.push(r);
      continue;
    }
    const msg = `Verification failed - not sent: ${problems.join("; ")}`.slice(0, 1000);
    await db().campaignContact.update({ where: { id: r.id }, data: { status: "FAILED", errorMessage: msg, scheduledAt: null } });
    await logActivity({
      category: "EMAIL_FAILURE",
      level: "ERROR",
      userId: campaign.userId,
      campaignId: campaign.id,
      message: `Not scheduling ${r.contact.email}: ${msg}`,
      metadata: { recipientId: r.id, email: r.contact.email, campaignId: campaign.id, problems, stage: "verification_failed" },
    });
  }
  return passed;
}

export interface ScheduleInput {
  startMode: "now" | "at";
  startAt?: string;
  intervalSeconds: number;
}

/**
 * The only way a campaign starts sending: the user confirms, picks a start time and interval,
 * and every approved recipient gets its own scheduled_at (start + i * interval).
 */
export async function scheduleCampaign(userId: string, campaignId: string, input: ScheduleInput, opts: { bulkConfirmed?: boolean } = {}) {
  const campaign = await refreshCampaignCounters((await getOwnedCampaign(userId, campaignId)).id);
  if (!campaign) throw new AppError("NOT_FOUND", "Campaign not found.");
  if (!opts.bulkConfirmed) throw new AppError("INVALID_STATE", `Campaigns are sent from the Send step (type "${BULK_CONFIRM_TEXT}").`);
  assertCanSend();
  if (campaign.status === "PAUSED") throw new AppError("INVALID_STATE", "This campaign is paused. Use Resume instead.");
  if (campaign.status !== "READY_FOR_REVIEW") {
    throw new AppError("INVALID_STATE", `A campaign in ${campaign.status.replace(/_/g, " ")} state cannot be scheduled. Generate and review emails first.`);
  }
  const { account } = await requireSender(userId);
  await requireConnectedEmail(userId);

  let start: Date;
  try {
    start = resolveStart(input);
  } catch (err) {
    throw new AppError("VALIDATION", errorMessage(err));
  }

  const candidates = await db().campaignContact.findMany({
    where: { campaignId, ...READY_APPROVED },
    include: { contact: true, currentEmail: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (candidates.length === 0) throw new AppError("INVALID_STATE", "There are no approved emails to schedule.");
  const passed = await verifyForScheduling(campaign, candidates);
  if (passed.length === 0) {
    await refreshCampaignCounters(campaignId);
    throw new AppError("INVALID_STATE", "Every approved email failed verification. Regenerate them, then schedule again.");
  }

  const times = computeSchedule(start, input.intervalSeconds, passed.length);
  const ids = passed.map((p) => p.id);
  await db().$transaction(async (tx) => {
    const moved = await tx.campaign.updateMany({
      where: { id: campaign.id, status: "READY_FOR_REVIEW" },
      data: {
        status: "SCHEDULED",
        senderAccountId: account.id,
        sendConfirmedAt: new Date(),
        scheduleStartAt: start,
        sendIntervalSec: input.intervalSeconds,
        pausedReason: null,
        completedAt: null,
        cancelledAt: null,
      },
    });
    if (moved.count === 0) throw new AppError("INVALID_STATE", "The campaign state changed. Refresh and try again.");
    await writeSchedule(tx, ids, times, ["READY"]);
  });

  await logActivity({
    category: "CAMPAIGN_STATE",
    userId,
    campaignId,
    message: `Campaign status changed READY_FOR_REVIEW -> SCHEDULED (user confirmed ${ids.length} emails from ${account.email} [${account.provider}], start ${start.toISOString()}, every ${formatInterval(input.intervalSeconds)})`,
    metadata: { count: ids.length, start: start.toISOString(), intervalSeconds: input.intervalSeconds, provider: account.provider },
  });
  await scheduleLogs(campaign, passed.map((p) => ({ id: p.id, email: p.contact.email ?? "" })), times, "Scheduled");
  await refreshCampaignCounters(campaignId);
  return { scheduled: ids.length, failedVerification: candidates.length - ids.length, firstAt: times[0].toISOString(), lastAt: times[times.length - 1].toISOString() };
}

export const BULK_CONFIRM_TEXT = "APPROVE & SEND ALL";
/** Above this many recipients the user must also type the exact count. */
export const BULK_COUNT_CONFIRM_THRESHOLD = 25;

/** Pending bulk rows that may be approved by the final action (never rejected or blocked rows). */
function bulkEligiblePending(campaignId: string): Prisma.CampaignContactWhereInput {
  return {
    campaignId,
    status: "READY",
    approvalStatus: "PENDING",
    currentEmailId: { not: null },
    generationError: null,
    contact: { email: { not: null } },
    NOT: { emailSource: "MANUAL", emailApprovedAt: null },
  };
}

/** What the final confirmation shows: exactly who would be sent to, and what is held back. */
export async function getBulkSendSummary(userId: string, campaignId: string) {
  const campaign = await refreshCampaignCounters((await getOwnedCampaign(userId, campaignId)).id);
  if (!campaign || campaign.kind !== "BULK") throw new AppError("NOT_FOUND", "Bulk campaign not found.");
  const cc = db().campaignContact;
  const [approved, pendingEligible, rejected, blocked, missingEmail, notGenerated, alreadySent, scheduled, providers, account] = await Promise.all([
    cc.count({ where: { campaignId, ...READY_APPROVED } }),
    cc.count({ where: bulkEligiblePending(campaignId) }),
    cc.count({ where: { campaignId, approvalStatus: "REJECTED", status: { notIn: ["SENT", "SCHEDULED", "SENDING"] } } }),
    cc.count({ where: { campaignId, status: "READY", currentEmailId: { not: null }, generationError: { not: null }, NOT: { approvalStatus: "REJECTED" } } }),
    cc.count({ where: { campaignId, contact: { email: null }, status: { notIn: ["SENT"] } } }),
    cc.count({ where: { campaignId, currentEmailId: null } }),
    cc.count({ where: { campaignId, status: "SENT" } }),
    cc.count({ where: { campaignId, status: { in: ["SCHEDULED", "SENDING"] } } }),
    getProviderStatus(userId),
    getActiveEmailAccount(userId),
  ]);
  const willSend = approved + pendingEligible;
  const warnings: string[] = [];
  if (!providers.email.connected) warnings.push(`${providers.email.label}: ${providers.email.detail}.`);
  if (providers.email.provider === "mock") warnings.push("Mock email provider: messages will NOT be delivered.");
  if (blocked) warnings.push(`${blocked} emails have problems (for example unreplaced placeholders) and will not be sent.`);
  if (missingEmail) warnings.push(`${missingEmail} rows have no approved recipient email and will not be sent.`);
  if (notGenerated) warnings.push(`${notGenerated} rows have no generated email and will not be sent.`);
  return {
    campaign: { id: campaign.id, campaignName: campaign.campaignName, status: campaign.status, sendIntervalSec: campaign.sendIntervalSec, scheduleTimezone: campaign.scheduleTimezone },
    sender: account ? { email: account.email, provider: account.provider, name: bulkSenderName(campaign) ?? account.displayName } : null,
    cc: campaign.ccEmails,
    counts: { willSend, approved, pendingEligible, rejected, blocked, missingEmail, notGenerated, alreadySent, scheduled },
    confirmText: BULK_CONFIRM_TEXT,
    requireCount: willSend > BULK_COUNT_CONFIRM_THRESHOLD,
    defaultIntervalSeconds: campaign.sendIntervalSec ?? 30,
    canSend: Boolean(account) && providers.email.connected && willSend > 0 && campaign.status === "READY_FOR_REVIEW",
    warnings,
  };
}

export interface BulkSendInput {
  confirmText: string;
  expectedCount?: number;
  startMode: "now" | "at";
  date?: string;
  time?: string;
  timezone?: string;
  intervalSeconds: number;
}

/**
 * The ONLY action that sends a bulk campaign. Requires the typed confirmation (and the exact count for
 * large campaigns), approves every eligible pending row, then schedules now or at a zoned date/time.
 */
export async function bulkApproveAndSend(userId: string, campaignId: string, input: BulkSendInput) {
  const campaign = await refreshCampaignCounters((await getOwnedCampaign(userId, campaignId)).id);
  if (!campaign || campaign.kind !== "BULK") throw new AppError("NOT_FOUND", "Bulk campaign not found.");
  if (input.confirmText.trim() !== BULK_CONFIRM_TEXT) throw new AppError("VALIDATION", `Type "${BULK_CONFIRM_TEXT}" exactly to confirm.`);
  assertCanSend();
  if (campaign.status !== "READY_FOR_REVIEW") {
    throw new AppError("INVALID_STATE", `A campaign in ${campaign.status.replace(/_/g, " ")} state cannot be sent. Generate and review the emails first.`);
  }
  const [approvedNow, pending] = await Promise.all([
    db().campaignContact.count({ where: { campaignId, ...READY_APPROVED } }),
    db().campaignContact.count({ where: bulkEligiblePending(campaignId) }),
  ]);
  const willSend = approvedNow + pending;
  if (willSend === 0) throw new AppError("INVALID_STATE", "There are no valid emails to send.");
  if (willSend > BULK_COUNT_CONFIRM_THRESHOLD && input.expectedCount !== willSend) {
    throw new AppError("VALIDATION", `This campaign will send ${willSend} emails. Type ${willSend} to confirm the count.`, { willSend });
  }

  let startAt: string | undefined;
  let timezone: string | null = null;
  if (input.startMode === "at") {
    if (!input.date || !input.time || !input.timezone) throw new AppError("VALIDATION", "Choose a date, time and time zone for the scheduled send.");
    try {
      startAt = zonedDateTimeToUtc(input.date, input.time, input.timezone).toISOString();
      resolveStart({ startMode: "at", startAt });
    } catch (err) {
      throw new AppError("VALIDATION", errorMessage(err));
    }
    timezone = input.timezone;
  }
  await requireSender(userId);
  await requireConnectedEmail(userId);

  const approved = await db().campaignContact.updateMany({ where: bulkEligiblePending(campaignId), data: { approvalStatus: "APPROVED" } });
  await logActivity({
    category: "CAMPAIGN_STATE",
    userId,
    campaignId,
    message: `User confirmed "${BULK_CONFIRM_TEXT}": ${approved.count} emails approved, ${willSend} to send${timezone ? ` at ${input.date} ${input.time} (${timezone})` : " now"}`,
    metadata: { approved: approved.count, willSend, startMode: input.startMode, timezone },
  });
  const result = await scheduleCampaign(userId, campaignId, { startMode: input.startMode, startAt, intervalSeconds: input.intervalSeconds }, { bulkConfirmed: true });
  await db().campaign.update({ where: { id: campaignId }, data: { scheduleTimezone: timezone } });
  return { approved: approved.count, ...result };
}

export async function pauseSending(userId: string, campaignId: string): Promise<void> {
  const campaign = await getOwnedCampaign(userId, campaignId);
  const ok = await transitionCampaign(campaign, ["SCHEDULED", "RUNNING"], "PAUSED", { pausedReason: "Paused by user" }, "paused by user");
  if (!ok) throw new AppError("INVALID_STATE", "Only a scheduled or running campaign can be paused.");
}

/**
 * Resumes a paused campaign. Remaining recipients (and any newly approved ones) are re-timed
 * from max(now, earliest pending slot) at the campaign interval, so nothing is sent in a burst.
 */
export async function resumeSending(userId: string, campaignId: string, opts: { intervalSeconds?: number } = {}) {
  const campaign = await getOwnedCampaign(userId, campaignId);
  if (campaign.status !== "PAUSED") throw new AppError("INVALID_STATE", "Only a paused campaign can be resumed.");
  assertCanSend();
  const { account } = await requireSender(userId);
  await requireConnectedEmail(userId);
  const interval = opts.intervalSeconds ?? campaign.sendIntervalSec ?? DEFAULT_INTERVAL_SECONDS;

  const [pending, newlyApproved] = await Promise.all([
    db().campaignContact.findMany({
      where: { campaignId, status: "SCHEDULED" },
      select: { id: true, scheduledAt: true, contact: { select: { email: true } } },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    db().campaignContact.findMany({
      where: { campaignId, ...READY_APPROVED },
      include: { contact: true, currentEmail: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const added = await verifyForScheduling(campaign, newlyApproved);
  const rows = [...pending.map((p) => ({ id: p.id, email: p.contact.email ?? "" })), ...added.map((a) => ({ id: a.id, email: a.contact.email ?? "" }))];
  const start = continueFrom(pending[0]?.scheduledAt ?? null);
  const times = computeSchedule(start, interval, rows.length);
  const anySent = (await db().campaignContact.count({ where: { campaignId, status: "SENT" } })) > 0;

  await db().$transaction(async (tx) => {
    const moved = await tx.campaign.updateMany({
      where: { id: campaign.id, status: "PAUSED" },
      data: { status: anySent ? "RUNNING" : "SCHEDULED", senderAccountId: account.id, pausedReason: null, sendIntervalSec: interval },
    });
    if (moved.count === 0) throw new AppError("INVALID_STATE", "The campaign state changed. Refresh and try again.");
    await writeSchedule(tx, rows.map((r) => r.id), times, ["SCHEDULED", "READY"]);
  });
  await logActivity({
    category: "CAMPAIGN_STATE",
    userId,
    campaignId,
    message: `Campaign status changed PAUSED -> ${anySent ? "RUNNING" : "SCHEDULED"} (resumed by user; ${rows.length} emails re-timed from ${start.toISOString()}, every ${formatInterval(interval)})`,
  });
  await scheduleLogs(campaign, rows, times, "Rescheduled");
  await refreshCampaignCounters(campaignId);
  return { scheduled: rows.length };
}

export async function cancelCampaign(userId: string, campaignId: string): Promise<number> {
  const campaign = await getOwnedCampaign(userId, campaignId);
  if (campaign.status === "COMPLETED") throw new AppError("INVALID_STATE", "This campaign has already finished.");
  const ok = await transitionCampaign(
    campaign,
    ["DRAFT", "GENERATING", "READY_FOR_REVIEW", "SCHEDULED", "RUNNING", "PAUSED", "FAILED"],
    "COMPLETED",
    { cancelledAt: new Date(), completedAt: new Date(), generationPaused: true, nextBatchAt: null, pausedReason: "Cancelled by user" },
    "cancelled by user",
  );
  if (!ok) throw new AppError("INVALID_STATE", "The campaign state changed. Refresh and try again.");
  const skipped = await db().campaignContact.updateMany({
    where: { campaignId, status: { in: ["SCHEDULED", "NEW", "READY"] } },
    data: { status: "SKIPPED", queuedForGeneration: false, scheduledAt: null },
  });
  await db().campaignContact.updateMany({ where: { campaignId, queuedForGeneration: true }, data: { queuedForGeneration: false } });
  await refreshCampaignCounters(campaignId);
  return skipped.count;
}

/** Re-schedules failed sends after everything already scheduled. Never touches SENT recipients. */
export async function retryFailedSends(userId: string, campaignId: string, ids?: string[]): Promise<number> {
  const campaign = await getOwnedCampaign(userId, campaignId);
  if (campaign.cancelledAt) throw new AppError("INVALID_STATE", "This campaign was cancelled; failed emails cannot be retried.");
  if (!["SCHEDULED", "RUNNING", "PAUSED", "COMPLETED"].includes(campaign.status)) {
    throw new AppError("INVALID_STATE", "Only failed sends of a scheduled campaign can be retried. For generation failures use Regenerate.");
  }
  const failed = await db().campaignContact.findMany({
    where: { campaignId, ...(ids?.length ? { id: { in: ids } } : {}), ...SEND_FAILED },
    select: { id: true, contact: { select: { email: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (failed.length === 0) return 0;
  if (campaign.status !== "PAUSED") {
    assertCanSend();
    await requireSender(userId);
    await requireConnectedEmail(userId);
  }
  const interval = campaign.sendIntervalSec ?? DEFAULT_INTERVAL_SECONDS;
  const last = await db().campaignContact.findFirst({
    where: { campaignId, status: "SCHEDULED" },
    orderBy: { scheduledAt: "desc" },
    select: { scheduledAt: true },
  });
  const times = computeSchedule(retryStart(last?.scheduledAt ?? null, interval), interval, failed.length);
  await db().$transaction(async (tx) => {
    await tx.campaignContact.updateMany({ where: { id: { in: failed.map((f) => f.id) } }, data: { errorMessage: null, retryCount: 0 } });
    await writeSchedule(tx, failed.map((f) => f.id), times, ["FAILED"]);
    if (campaign.status === "COMPLETED") {
      await tx.campaign.updateMany({ where: { id: campaign.id, status: "COMPLETED" }, data: { status: "RUNNING", completedAt: null } });
    }
  });
  if (campaign.status === "COMPLETED") {
    await logActivity({ category: "CAMPAIGN_STATE", userId, campaignId, message: "Campaign status changed COMPLETED -> RUNNING (retry failed)" });
  }
  await scheduleLogs(campaign, failed.map((f) => ({ id: f.id, email: f.contact.email ?? "" })), times, "Retry scheduled");
  await refreshCampaignCounters(campaignId);
  await logActivity({ category: "RETRY", userId, campaignId, message: `Queued ${failed.length} failed emails for retry` });
  return failed.length;
}

function bulkSenderName(campaign: Pick<Campaign, "kind" | "senderSnapshot">): string | null {
  return campaign.kind === "BULK" ? (snapshotSender(campaign.senderSnapshot)?.senderName ?? null) : null;
}

export async function sendTestEmail(userId: string, campaignId: string, recipientId: string, to: string) {
  const campaign = await getOwnedCampaign(userId, campaignId);
  assertCanSend();
  const { account, selected } = await requireSender(userId);
  const cc = await db().campaignContact.findFirst({
    where: { id: recipientId, campaignId },
    include: { contact: true, currentEmail: true },
  });
  if (!cc) throw new AppError("NOT_FOUND", "Recipient not found.");
  if (!cc.currentEmail) throw new AppError("INVALID_STATE", "Generate this email before sending a test.");

  // A test goes only to the address the user typed; the campaign CC list is not copied on tests.
  const outgoing = { ...composeOutgoing({ account, contact: cc.contact, email: cc.currentEmail, senderName: bulkSenderName(campaign) }), to, cc: [] };
  const record = await db().emailSend.create({
    data: {
      campaignId,
      campaignContactId: cc.id,
      generatedEmailId: cc.currentEmail.id,
      kind: "TEST",
      status: "SENDING",
      provider: account.provider,
      fromEmail: account.email,
      toEmail: to,
      subject: outgoing.subject,
      body: outgoing.body,
    },
  });
  try {
    const result = await sendingProvider(account, selected).sendTestEmail(outgoing);
    await db().emailSend.update({ where: { id: record.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: result.providerMessageId } });
    await logActivity({
      category: "EMAIL_SEND",
      userId,
      campaignId,
      message: `Test email sent to ${to} (preview of ${cc.contact.email})${account.provider === "MOCK" ? " [MOCK - not delivered]" : ""}`,
      metadata: { recipientId: cc.id, providerMessageId: result.providerMessageId, provider: account.provider },
    });
    return { status: "SENT" as const, mock: account.provider === "MOCK" };
  } catch (err) {
    const message = err instanceof ProviderError ? describeProviderError(err) : "The test email could not be sent.";
    await db().emailSend.update({ where: { id: record.id }, data: { status: "FAILED", errorMessage: message } });
    await logActivity({ category: "EMAIL_FAILURE", level: "ERROR", userId, campaignId, message: `Test email to ${to} failed: ${message}` });
    throw new AppError(err instanceof ProviderError && err.kind === "AUTH" ? "PROVIDER_AUTH" : "PROVIDER_ERROR", message);
  }
}

/* ----------------------------------------------------------------------------------------- */
/* Worker                                                                                    */
/* ----------------------------------------------------------------------------------------- */

/** Atomically claims recipients whose scheduled time has arrived (campaign must be SCHEDULED/RUNNING). */
async function claimDueRecipients(limit: number): Promise<string[]> {
  const now = new Date().toISOString();
  const rows = await db().$queryRaw<{ id: string }[]>`
    UPDATE campaign_contacts
    SET status = 'SENDING', locked_at = now(), updated_at = now()
    WHERE id IN (
      SELECT cc.id FROM campaign_contacts cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE cc.status = 'SCHEDULED'
        AND cc.scheduled_at IS NOT NULL
        AND cc.scheduled_at <= (${now}::timestamptz AT TIME ZONE 'UTC')
        AND c.status IN ('SCHEDULED', 'RUNNING')
      ORDER BY cc.scheduled_at ASC, cc.id ASC
      LIMIT ${limit}
      FOR UPDATE OF cc SKIP LOCKED
    )
    RETURNING id`;
  return rows.map((r) => r.id);
}

async function releaseToSchedule(ccId: string, data: Prisma.CampaignContactUpdateManyMutationInput = {}) {
  await db().campaignContact.updateMany({ where: { id: ccId, status: "SENDING" }, data: { status: "SCHEDULED", lockedAt: null, ...data } });
}

async function pauseCampaign(campaign: Campaign, reason: string, why: string) {
  await transitionCampaign(campaign, ["SCHEDULED", "RUNNING"], "PAUSED", { pausedReason: reason }, why);
}

/** Called by the worker loop: sends every recipient whose scheduled time has arrived, in order. */
/** Subscription ended (or license unverifiable): park active campaigns as PAUSED so nothing is lost; Resume continues them. */
async function pauseForLicense(): Promise<boolean> {
  const license = licenseState();
  if (license.canSend) return false;
  const active = await db().campaign.findMany({ where: { status: { in: ["SCHEDULED", "RUNNING"] } } });
  for (const campaign of active) {
    await pauseCampaign(campaign, LICENSE_MESSAGES[license.state], `paused: subscription ${license.state}`);
  }
  return true;
}

export async function sendingTick(onSettled: () => void): Promise<void> {
  if (state.__sendBusy) return;
  if (await pauseForLicense()) return;
  const ids = await claimDueRecipients(env().EMAIL_BATCH_SIZE);
  if (ids.length === 0) return;
  state.__sendBusy = true;
  void (async () => {
    for (const id of ids) {
      try {
        await processRecipient(id);
      } catch (err) {
        console.error("[sending] recipient crashed", errorMessage(err));
        await releaseToSchedule(id, { scheduledAt: new Date(Date.now() + 60_000) }).catch(() => undefined);
      }
    }
  })().finally(() => {
    state.__sendBusy = false;
    onSettled();
  });
}

type SendOutcome = "SENT" | "FAILED" | "RETRY" | "SKIPPED" | "AUTH" | "RATE_LIMIT" | "PAUSED";

async function processRecipient(ccId: string): Promise<SendOutcome> {
  const cc = await db().campaignContact.findUnique({
    where: { id: ccId },
    include: { contact: true, currentEmail: true, campaign: { include: { senderAccount: true } } },
  });
  if (!cc || cc.status !== "SENDING") return "SKIPPED";
  const { campaign } = cc;
  const meta = { recipientId: cc.id, email: cc.contact.email, campaignId: campaign.id, scheduledAt: cc.scheduledAt?.toISOString() ?? null };

  if (campaign.status !== "SCHEDULED" && campaign.status !== "RUNNING") {
    await releaseToSchedule(cc.id);
    return "PAUSED";
  }
  if (!campaign.senderAccount) {
    await releaseToSchedule(cc.id);
    await pauseCampaign(campaign, "Sender email account is no longer connected. Reconnect it, then resume.", "sender account missing");
    return "PAUSED";
  }
  let provider: EmailProvider;
  try {
    provider = sendingProvider(campaign.senderAccount, (await getProviderSettings(campaign.userId)).email);
  } catch (err) {
    await releaseToSchedule(cc.id);
    await pauseCampaign(campaign, errorMessage(err), "provider unavailable");
    return "PAUSED";
  }
  if (campaign.status === "SCHEDULED") {
    await transitionCampaign(campaign, ["SCHEDULED"], "RUNNING", { sendStartedAt: campaign.sendStartedAt ?? new Date() }, "first scheduled email is due");
  }
  const outcome = await sendOne(campaign, campaign.senderAccount, provider, cc, meta);
  if (outcome === "AUTH") {
    await pauseCampaign(campaign, "Email account authorization failed. Reconnect your email account in Settings, then resume.", "email authentication failure");
  }
  await refreshCampaignCounters(campaign.id);
  return outcome;
}

async function sendOne(
  campaign: Campaign,
  account: EmailAccount,
  provider: EmailProvider,
  cc: VerifiableRecipient,
  meta: Record<string, unknown>,
): Promise<SendOutcome> {
  const e = env();
  const fail = async (message: string, stage: string) => {
    await db().campaignContact.update({ where: { id: cc.id }, data: { status: "FAILED", errorMessage: message.slice(0, 1000), lockedAt: null } });
    await logActivity({
      category: "EMAIL_FAILURE",
      level: "ERROR",
      userId: campaign.userId,
      campaignId: campaign.id,
      message: `Not sent to ${cc.contact.email}: ${message}`,
      metadata: { ...meta, stage, status: "FAILED", error: message },
    });
    return "FAILED" as const;
  };

  if (!cc.currentEmail) return fail("No generated email", "verification_failed");

  // Idempotency: a recipient with a successful send is never sent again.
  const prior = await db().emailSend.findFirst({ where: { campaignContactId: cc.id, kind: "CAMPAIGN", status: "SENT" } });
  if (prior) {
    await db().campaignContact.update({
      where: { id: cc.id },
      data: { status: "SENT", sentAt: prior.sentAt, providerMessageId: prior.providerMessageId, lockedAt: null },
    });
    await logActivity({
      category: "EMAIL_SEND",
      level: "WARN",
      userId: campaign.userId,
      campaignId: campaign.id,
      message: `Duplicate send prevented for ${cc.contact.email}`,
      metadata: { ...meta, stage: "duplicate_prevented", messageId: prior.providerMessageId },
    });
    return "SKIPPED";
  }

  const problems = await verifyRecipient(cc, campaign);
  const outgoing = composeOutgoing({ account, contact: cc.contact, email: cc.currentEmail, senderName: bulkSenderName(campaign), cc: campaign.ccEmails });
  if (outgoing.to !== cc.contact.email) problems.push("Outgoing address does not match the recipient row");
  if (problems.length) return fail(`Verification failed - not sent: ${problems.join("; ")}`, "verification_failed");

  let sendId: string;
  try {
    const rec = await db().emailSend.create({
      data: {
        campaignId: campaign.id,
        campaignContactId: cc.id,
        generatedEmailId: cc.currentEmail.id,
        kind: "CAMPAIGN",
        status: "SENDING",
        provider: account.provider,
        fromEmail: account.email,
        toEmail: outgoing.to,
        ccEmails: outgoing.cc ?? [],
        subject: outgoing.subject,
        body: outgoing.body,
        attempt: cc.retryCount + 1,
      },
    });
    sendId = rec.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // The partial unique index says another send is in progress or done: never risk a second one.
      await db().campaignContact.update({ where: { id: cc.id }, data: { status: "FAILED", lockedAt: null, errorMessage: "Another send for this recipient is in progress or completed." } });
      await logActivity({
        category: "EMAIL_SEND",
        level: "WARN",
        userId: campaign.userId,
        campaignId: campaign.id,
        message: `Duplicate send prevented for ${cc.contact.email} (another send is in progress or completed)`,
        metadata: { ...meta, stage: "duplicate_prevented" },
      });
      return "SKIPPED";
    }
    throw err;
  }

  await logActivity({
    category: "EMAIL_SEND",
    userId: campaign.userId,
    campaignId: campaign.id,
    message: `Sending to ${cc.contact.email} via ${account.provider}`,
    metadata: { ...meta, stage: "send_started", provider: account.provider, attempt: cc.retryCount + 1 },
  });

  try {
    const result = await provider.sendEmail(outgoing);
    const sentAt = new Date();
    await db().$transaction([
      db().emailSend.update({ where: { id: sendId }, data: { status: "SENT", sentAt, providerMessageId: result.providerMessageId } }),
      db().campaignContact.update({
        where: { id: cc.id },
        data: { status: "SENT", sentAt, providerMessageId: result.providerMessageId, errorMessage: null, lockedAt: null },
      }),
    ]);
    await logActivity({
      category: "EMAIL_SEND",
      userId: campaign.userId,
      campaignId: campaign.id,
      message: `Sent to ${cc.contact.email}${account.provider === "MOCK" ? " [MOCK - not delivered]" : ""}`,
      metadata: { ...meta, stage: "send_completed", status: "SENT", messageId: result.providerMessageId, provider: account.provider, attempt: cc.retryCount + 1 },
    });
    return "SENT";
  } catch (err) {
    const pErr = err instanceof ProviderError ? err : new ProviderError("TRANSIENT", errorMessage(err));
    const friendly = describeProviderError(pErr);
    await db().emailSend.update({ where: { id: sendId }, data: { status: "FAILED", errorMessage: friendly } });
    const errMeta = { ...meta, stage: "send_failed", kind: pErr.kind, httpStatus: pErr.httpStatus, error: friendly };

    if (pErr.kind === "AUTH") {
      // Not the recipient's fault: keep its slot without consuming a retry; the campaign pauses.
      await releaseToSchedule(cc.id, { errorMessage: friendly });
      await logActivity({ category: "AUTH", level: "ERROR", userId: campaign.userId, campaignId: campaign.id, message: `Sending to ${cc.contact.email} interrupted: ${friendly}`, metadata: errMeta });
      return "AUTH";
    }
    if (pErr.kind === "RATE_LIMIT") {
      const shiftMs = Math.min(MAX_RATE_LIMIT_SHIFT_MS, pErr.retryAfterMs ?? backoffDelay(2, 30_000, MAX_RATE_LIMIT_SHIFT_MS));
      await releaseToSchedule(cc.id, { errorMessage: friendly });
      await db().$executeRaw`
        UPDATE campaign_contacts SET scheduled_at = scheduled_at + (${shiftMs}::int * interval '1 millisecond'), updated_at = now()
        WHERE campaign_id = ${campaign.id} AND status = 'SCHEDULED'`;
      await logActivity({
        category: "EMAIL_FAILURE",
        level: "WARN",
        userId: campaign.userId,
        campaignId: campaign.id,
        message: `Provider rate limit hit. Remaining schedule shifted by ${Math.round(shiftMs / 1000)}s.`,
        metadata: errMeta,
      });
      return "RATE_LIMIT";
    }

    const retries = cc.retryCount + 1;
    const retryable = pErr.kind === "TRANSIENT" && retries < e.MAX_EMAIL_RETRIES;
    if (retryable) {
      const delay = backoffDelay(retries, 30_000, 15 * 60_000);
      await releaseToSchedule(cc.id, { retryCount: retries, errorMessage: friendly, scheduledAt: new Date(Date.now() + delay) });
    } else {
      await db().campaignContact.update({ where: { id: cc.id }, data: { status: "FAILED", retryCount: retries, errorMessage: friendly, lockedAt: null } });
    }
    await logActivity({
      category: retryable ? "RETRY" : "EMAIL_FAILURE",
      level: retryable ? "WARN" : "ERROR",
      userId: campaign.userId,
      campaignId: campaign.id,
      message: retryable
        ? `Send to ${cc.contact.email} failed (attempt ${retries}/${e.MAX_EMAIL_RETRIES}), will retry automatically: ${friendly}`
        : `Send to ${cc.contact.email} failed after ${retries} attempt(s): ${friendly}`,
      metadata: { ...errMeta, status: retryable ? "SCHEDULED" : "FAILED", attempt: retries },
    });
    return retryable ? "RETRY" : "FAILED";
  }
}

/**
 * Recovers recipients stuck in SENDING after a crash. If a provider call may have happened
 * (an EmailSend row is still SENDING), the outcome is unknown: mark FAILED and require a manual
 * retry rather than risk a duplicate.
 */
export async function recoverStaleSending(maxAgeMs = 10 * 60 * 1000): Promise<void> {
  if (state.__sendBusy && maxAgeMs > 0) return;
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = await db().campaignContact.findMany({
    where: { status: "SENDING", OR: [{ lockedAt: null }, { lockedAt: { lte: cutoff } }] },
    select: { id: true, campaignId: true, campaign: { select: { userId: true } } },
  });
  for (const s of stale) {
    const sent = await db().emailSend.findFirst({ where: { campaignContactId: s.id, kind: "CAMPAIGN", status: "SENT" } });
    if (sent) {
      await db().campaignContact.update({ where: { id: s.id }, data: { status: "SENT", sentAt: sent.sentAt, providerMessageId: sent.providerMessageId, lockedAt: null } });
      continue;
    }
    const pending = await db().emailSend.findFirst({ where: { campaignContactId: s.id, kind: "CAMPAIGN", status: "SENDING" } });
    if (pending) {
      const msg = "Sending was interrupted and delivery status is unknown. Check your Sent folder before retrying.";
      await db().emailSend.update({ where: { id: pending.id }, data: { status: "FAILED", errorMessage: msg } });
      await db().campaignContact.update({ where: { id: s.id }, data: { status: "FAILED", errorMessage: msg, lockedAt: null } });
      await logActivity({ category: "EMAIL_FAILURE", level: "WARN", userId: s.campaign.userId, campaignId: s.campaignId, message: msg, metadata: { recipientId: s.id } });
    } else {
      await db().campaignContact.update({ where: { id: s.id }, data: { status: "SCHEDULED", lockedAt: null } });
    }
    await refreshCampaignCounters(s.campaignId);
  }
}
