import "server-only";
import { autoMapBulkColumns, sanitizeBulkMapping, type BulkMapping } from "@/lib/bulk/fields";
import type { BulkSender } from "@/lib/bulk/placeholders";
import { bulkRowStatus } from "@/lib/bulk/status";
import { validateBulkRows } from "@/lib/bulk/validate";
import { isValidEmail } from "@/lib/csv/validate";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import type { Campaign, Prisma } from "@/lib/generated/prisma/client";
import { getOwnedTemplate } from "./campaign-templates";
import { getOwnedCampaign, refreshCampaignCounters, transitionCampaign } from "./campaigns";
import { logActivity } from "./logs";
import { getActiveEmailAccount } from "./providers";
import { getDefaultProfile, getOwnedProfile, serializeProfile, toBulkSender } from "./sender-profiles";
import { assertCanRunCampaign, recordCampaignRun } from "./credits";

/** Model name stored when the AI output was not used and the template text was kept. */
export const BULK_MODEL = "template/placeholders";
const EDIT_LOCKED: Campaign["status"][] = ["RUNNING", "SCHEDULED", "COMPLETED"];
const LOCKED_ROW = ["SCHEDULED", "SENDING", "SENT"];

export async function getOwnedBulkCampaign(userId: string, campaignId: string) {
  const campaign = await getOwnedCampaign(userId, campaignId);
  if (campaign.kind !== "BULK") throw new AppError("INVALID_STATE", "This campaign cannot be opened in the send wizard.");
  return campaign;
}

function resolveMapping(headers: string[], mapping?: Partial<BulkMapping>): { mapping: BulkMapping; missing: string[] } {
  const m = mapping ? sanitizeBulkMapping(mapping, headers) : autoMapBulkColumns(headers);
  const missing = (["company_name", "to_name", "email"] as const).filter((k) => !m[k]);
  return { mapping: m, missing };
}

/** Validation report shown before anything is saved. */
export function checkBulkImport(input: { headers: string[]; rows: Record<string, string>[]; mapping?: Partial<BulkMapping> }) {
  const { mapping, missing } = resolveMapping(input.headers, input.mapping);
  if (missing.length) return { mapping, missingColumns: missing, summary: null, issues: [], preview: [] };
  const v = validateBulkRows(input.rows, mapping);
  const strip = (r: (typeof v.rows)[number]) => ({
    rowNumber: r.rowNumber,
    companyName: r.companyName,
    toName: r.toName,
    fromName: r.fromName,
    email: r.email,
    errors: r.errors,
    warnings: r.warnings,
  });
  return {
    mapping,
    missingColumns: [],
    summary: v.summary,
    issues: v.rows.filter((r) => r.errors.length || r.warnings.length).slice(0, 2000).map(strip),
    preview: v.rows.slice(0, 20).map(strip),
  };
}

/** Creates a campaign from the valid rows of the contact file. */
export async function importBulkCampaign(
  userId: string,
  input: { headers: string[]; rows: Record<string, string>[]; mapping?: Partial<BulkMapping>; campaignName: string; fileName?: string; templateId?: string | null },
) {
  const { mapping, missing } = resolveMapping(input.headers, input.mapping);
  if (missing.length) throw new AppError("VALIDATION", `Map the required column(s): ${missing.join(", ")}.`);
  const v = validateBulkRows(input.rows, mapping);
  const valid = v.rows.filter((r) => r.errors.length === 0 && r.email);
  if (!valid.length) throw new AppError("VALIDATION", "No valid rows to import. Fix the errors in the validation report.");

  const template = input.templateId ? await getOwnedTemplate(userId, input.templateId) : null;
  const profileId = template?.senderProfileId ?? (await getDefaultProfile(userId))?.id ?? null;

  const campaign = await db().campaign.create({
    data: {
      userId,
      kind: "BULK",
      campaignName: input.campaignName,
      description: input.fileName ? `Contacts from ${input.fileName.slice(0, 200)}` : null,
      bulkBody: template?.body ?? null,
      subjectMode: template?.subjectMode ?? "FIXED",
      subjectTemplate: template?.subjectTemplate ?? null,
      aiPersonalization: true,
      aiInstructions: template?.aiInstructions ?? null,
      productLineFallback: template?.productLineFallback ?? null,
      ccEmails: template?.ccEmails ?? [],
      senderProfileId: profileId,
      templateId: template?.id ?? null,
      promptVersions: { create: { version: 1 } },
    },
  });

  // Existing contacts with the same address are reused (and refreshed with this file's values).
  const existing = new Map<string, string>();
  for (let i = 0; i < valid.length; i += 1000) {
    const found = await db().contact.findMany({
      where: { userId, email: { in: valid.slice(i, i + 1000).map((r) => r.email!) } },
      select: { id: true, email: true },
    });
    for (const f of found) if (f.email) existing.set(f.email, f.id);
  }
  const fields = (r: (typeof valid)[number]) => ({
    toPersonName: r.toName,
    companyName: r.companyName,
    fromPersonName: r.fromName || null,
    customFields: (Object.keys(r.extra).length ? r.extra : undefined) as Prisma.InputJsonObject | undefined,
  });
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100).filter((r) => existing.has(r.email!));
    if (chunk.length) await db().$transaction(chunk.map((r) => db().contact.update({ where: { id: existing.get(r.email!)! }, data: fields(r) })));
  }
  const toCreate = valid.filter((r) => !existing.has(r.email!));
  for (let i = 0; i < toCreate.length; i += 500) {
    const chunk = toCreate.slice(i, i + 500);
    const created = await db().contact.createManyAndReturn({ data: chunk.map((r) => ({ userId, email: r.email, ...fields(r) })), select: { id: true, email: true } });
    for (const c of created) if (c.email) existing.set(c.email, c.id);
  }

  const base = Date.now();
  for (let i = 0; i < valid.length; i += 500) {
    await db().campaignContact.createMany({
      data: valid.slice(i, i + 500).map((r, j) => ({
        campaignId: campaign.id,
        contactId: existing.get(r.email!)!,
        emailSource: "CSV" as const,
        createdAt: new Date(base + i + j),
      })),
      skipDuplicates: true,
    });
  }
  await refreshCampaignCounters(campaign.id);
  await logActivity({
    category: "CSV_IMPORT",
    userId,
    campaignId: campaign.id,
    message: `Campaign "${campaign.campaignName}" created: ${valid.length} contacts imported, ${v.summary.invalid} skipped`,
    metadata: { imported: valid.length, skipped: v.summary.invalid, fileName: input.fileName ?? null },
  });
  return { campaignId: campaign.id, imported: valid.length, skipped: v.summary.invalid };
}

export async function updateBulkSettings(
  userId: string,
  campaignId: string,
  patch: {
    bulkBody?: string;
    subjectMode?: "FIXED" | "AI";
    subjectTemplate?: string | null;
    aiInstructions?: string | null;
    productLineFallback?: string | null;
    senderProfileId?: string | null;
    templateId?: string | null;
    ccEmails?: string[];
  },
) {
  const campaign = await getOwnedBulkCampaign(userId, campaignId);
  if (EDIT_LOCKED.includes(campaign.status)) throw new AppError("INVALID_STATE", "Pause the campaign before changing its email, sender or CC.");
  if (patch.senderProfileId) await getOwnedProfile(userId, patch.senderProfileId);
  if (patch.templateId) await getOwnedTemplate(userId, patch.templateId);
  const data: Prisma.CampaignUncheckedUpdateInput = {};
  for (const key of ["bulkBody", "subjectMode", "subjectTemplate", "aiInstructions", "productLineFallback", "senderProfileId", "templateId", "ccEmails"] as const) {
    if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  }
  const updated = await db().campaign.update({ where: { id: campaignId }, data });
  await logActivity({ category: "CAMPAIGN_STATE", userId, campaignId, message: `Campaign settings updated (${Object.keys(data).join(", ") || "no changes"})` });
  return updated;
}

async function senderFor(userId: string, campaign: Campaign): Promise<BulkSender> {
  if (!campaign.senderProfileId) throw new AppError("VALIDATION", "Add your sender details first (step Sender & CC).");
  const profile = await getOwnedProfile(userId, campaign.senderProfileId);
  const sender = toBulkSender(profile);
  if (!sender.email) sender.email = (await getActiveEmailAccount(userId))?.email ?? null;
  return sender;
}

export function snapshotSender(value: unknown): BulkSender | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const s = (k: string) => (typeof v[k] === "string" && v[k] ? (v[k] as string) : null);
  return { senderName: s("senderName") ?? "", designation: s("designation"), companyName: s("companyName"), email: s("email"), phone: s("phone"), website: s("website") };
}

export type BulkGenerateMode = "all" | "missing" | "selected" | "failed";

/**
 * Queues rows for the AI: each email starts from the uploaded body (placeholders filled, signature
 * appended) and OpenRouter adjusts it with that row's details. Nothing is scheduled here.
 */
export async function generateBulk(userId: string, campaignId: string, opts: { mode: BulkGenerateMode; ids?: string[] }) {
  const campaign = await getOwnedBulkCampaign(userId, campaignId);
  if (campaign.status === "RUNNING" || campaign.status === "SCHEDULED") throw new AppError("INVALID_STATE", "Pause the campaign before generating or regenerating emails.");
  if (campaign.status === "COMPLETED") throw new AppError("INVALID_STATE", "This campaign has finished.");
  if (!campaign.bulkBody?.trim()) throw new AppError("VALIDATION", "Upload or paste the email body first (step 2, Email body).");
  if (campaign.subjectMode !== "AI" && !campaign.subjectTemplate?.trim()) throw new AppError("VALIDATION", "Enter a subject, or choose AI-generated subjects.");
  if (opts.mode === "selected" && !opts.ids?.length) throw new AppError("VALIDATION", "Select at least one row.");
  if (opts.mode === "all") await assertCanRunCampaign(userId);

  const sender = await senderFor(userId, campaign);
  await db().campaign.update({ where: { id: campaignId }, data: { senderSnapshot: sender as unknown as Prisma.InputJsonObject } });

  const where: Prisma.CampaignContactWhereInput = { campaignId, queuedForGeneration: false, status: { in: ["NEW", "READY", "FAILED"] } };
  if (opts.mode === "all") where.NOT = { approvalStatus: "REJECTED" };
  if (opts.mode === "missing") where.currentEmailId = null;
  if (opts.mode === "selected") where.id = { in: opts.ids };
  if (opts.mode === "failed") where.generationError = { not: null };
  const ids = (await db().campaignContact.findMany({ where, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((r) => r.id);
  if (!ids.length) return { queued: 0 };
  if (opts.mode === "all") await recordCampaignRun(userId);

  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    await db().$transaction([
      db().campaignContact.updateMany({
        where: { id: { in: chunk }, currentEmailId: { not: null } },
        data: { queuedForGeneration: true, generationError: null, errorMessage: null, nextAttemptAt: null, scheduledAt: null, status: "READY", approvalStatus: "PENDING" },
      }),
      db().campaignContact.updateMany({
        where: { id: { in: chunk }, currentEmailId: null },
        data: { queuedForGeneration: true, generationError: null, errorMessage: null, nextAttemptAt: null, scheduledAt: null, status: "NEW", approvalStatus: "PENDING" },
      }),
    ]);
  }
  await db().campaign.update({ where: { id: campaignId }, data: { generationPaused: false, generationPausedReason: null } });
  await transitionCampaign(campaign, ["DRAFT", "READY_FOR_REVIEW", "FAILED", "PAUSED"], "GENERATING", {}, `${ids.length} emails queued for AI`);
  await refreshCampaignCounters(campaignId);
  await logActivity({ category: "AI_GENERATION", userId, campaignId, message: `Queued ${ids.length} emails for AI (mode: ${opts.mode})` });
  return { queued: ids.length };
}

/** Corrects one row's recipient address before it is scheduled; the email must be approved again. */
export async function setRecipientEmail(userId: string, campaignId: string, rowId: string, input: { email: string }) {
  await getOwnedBulkCampaign(userId, campaignId);
  const row = await db().campaignContact.findFirst({ where: { id: rowId, campaignId }, include: { contact: true } });
  if (!row) throw new AppError("NOT_FOUND", "Recipient not found.");
  if (LOCKED_ROW.includes(row.status)) throw new AppError("INVALID_STATE", "This email is already scheduled or sent.");
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new AppError("VALIDATION", `"${email.slice(0, 100)}" is not a valid email address.`);

  if (row.contact.email !== email) {
    const owner = await db().contact.findFirst({ where: { userId, email, id: { not: row.contactId } }, select: { id: true, toPersonName: true } });
    if (owner) {
      const sameCampaign = await db().campaignContact.findFirst({ where: { campaignId, contactId: owner.id }, select: { id: true } });
      if (sameCampaign) throw new AppError("CONFLICT", `${email} is already the recipient of another row in this campaign (${owner.toPersonName ?? "another contact"}).`);
      await db().$transaction(async (tx) => {
        await tx.contact.update({
          where: { id: owner.id },
          data: { toPersonName: row.contact.toPersonName, companyName: row.contact.companyName, fromPersonName: row.contact.fromPersonName, customFields: row.contact.customFields ?? undefined },
        });
        await tx.campaignContact.update({ where: { id: row.id }, data: { contactId: owner.id } });
      });
    } else {
      await db().contact.update({ where: { id: row.contactId }, data: { email } });
    }
  }
  await db().campaignContact.update({
    where: { id: row.id },
    data: { emailSource: "MANUAL", emailApprovedAt: new Date(), ...(row.approvalStatus === "APPROVED" ? { approvalStatus: "PENDING" } : {}) },
  });
  await logActivity({ category: "CAMPAIGN_STATE", userId, campaignId, message: `Recipient email for ${row.contact.toPersonName ?? "row"} (${row.contact.companyName ?? ""}) changed to ${email}`, metadata: { recipientId: row.id, email } });
  await refreshCampaignCounters(campaignId);
}

export async function getBulkOverview(userId: string, campaignId: string) {
  const campaign = await getOwnedBulkCampaign(userId, campaignId);
  const cc = db().campaignContact;
  const w = (extra: Prisma.CampaignContactWhereInput) => cc.count({ where: { campaignId, ...extra } });
  const [total, generated, blocked, approved, rejected, scheduled, sending, sent, failed, queued, profile, account] = await Promise.all([
    w({}),
    w({ currentEmailId: { not: null } }),
    w({ currentEmailId: { not: null }, generationError: { not: null }, status: { notIn: ["SENT"] } }),
    w({ approvalStatus: "APPROVED", status: "READY", currentEmailId: { not: null } }),
    w({ approvalStatus: "REJECTED" }),
    w({ status: "SCHEDULED" }),
    w({ status: "SENDING" }),
    w({ status: "SENT" }),
    w({ status: "FAILED", currentEmailId: { not: null }, generationError: null }),
    w({ OR: [{ queuedForGeneration: true }, { status: "GENERATING" }] }),
    campaign.senderProfileId ? db().senderProfile.findFirst({ where: { id: campaign.senderProfileId, userId } }) : null,
    getActiveEmailAccount(userId),
  ]);
  return {
    campaign: {
      id: campaign.id,
      campaignName: campaign.campaignName,
      status: campaign.status,
      bulkBody: campaign.bulkBody,
      subjectMode: campaign.subjectMode ?? "FIXED",
      subjectTemplate: campaign.subjectTemplate,
      aiInstructions: campaign.aiInstructions,
      productLineFallback: campaign.productLineFallback,
      ccEmails: campaign.ccEmails,
      senderProfileId: campaign.senderProfileId,
      templateId: campaign.templateId,
      generationPaused: campaign.generationPaused,
      generationPausedReason: campaign.generationPausedReason,
      scheduleStartAt: campaign.scheduleStartAt?.toISOString() ?? null,
      scheduleTimezone: campaign.scheduleTimezone,
      sendIntervalSec: campaign.sendIntervalSec,
      pausedReason: campaign.pausedReason,
    },
    senderProfile: profile ? serializeProfile(profile) : null,
    senderSnapshot: snapshotSender(campaign.senderSnapshot),
    connectedEmail: account?.email ?? null,
    counts: { total, generated, blocked, approved, rejected, scheduled, sending, sent, failed, queued, pendingReview: Math.max(0, generated - approved - rejected - sent - scheduled - sending - failed - blocked) },
  };
}

export type BulkRowFilter = "all" | "invalid" | "ready" | "approved" | "rejected" | "queued" | "sent" | "failed";

export async function listBulkRows(userId: string, campaignId: string, q: { filter: BulkRowFilter; search?: string; page: number; pageSize: number }) {
  await getOwnedBulkCampaign(userId, campaignId);
  const where: Prisma.CampaignContactWhereInput = { campaignId };
  const and: Prisma.CampaignContactWhereInput[] = [];
  switch (q.filter) {
    case "invalid":
      and.push({ status: { notIn: ["SENT", "SENDING", "SCHEDULED"] }, NOT: { approvalStatus: "REJECTED" }, generationError: { not: null } });
      break;
    case "ready":
      and.push({ status: "READY", approvalStatus: "PENDING", currentEmailId: { not: null }, generationError: null });
      break;
    case "approved":
      and.push({ status: "READY", approvalStatus: "APPROVED", currentEmailId: { not: null } });
      break;
    case "rejected":
      and.push({ approvalStatus: "REJECTED", status: { notIn: ["SENT", "SENDING", "SCHEDULED"] } });
      break;
    case "queued":
      and.push({ status: { in: ["SCHEDULED", "SENDING"] } });
      break;
    case "sent":
      and.push({ status: "SENT" });
      break;
    case "failed":
      and.push({ status: "FAILED" });
      break;
  }
  if (q.search?.trim()) {
    const s = q.search.trim();
    and.push({
      contact: {
        OR: [
          { email: { contains: s, mode: "insensitive" } },
          { companyName: { contains: s, mode: "insensitive" } },
          { toPersonName: { contains: s, mode: "insensitive" } },
          { fromPersonName: { contains: s, mode: "insensitive" } },
        ],
      },
    });
  }
  if (and.length) where.AND = and;

  const [total, rows] = await Promise.all([
    db().campaignContact.count({ where }),
    db().campaignContact.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        contact: { select: { email: true, toPersonName: true, companyName: true, fromPersonName: true, customFields: true } },
        currentEmail: { select: { id: true, subject: true, body: true, model: true, version: true, editedByUser: true } },
      },
    }),
  ]);
  // Row numbers follow the import order across the whole campaign, not just this page.
  const firstCreated = rows[0]?.createdAt;
  const offset = firstCreated ? await db().campaignContact.count({ where: { campaignId, createdAt: { lt: firstCreated } } }) : 0;
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((r, i) => ({
      id: r.id,
      number: offset + i + 1,
      customerName: r.contact.toPersonName ?? "",
      companyName: r.contact.companyName ?? "",
      fromName: r.contact.fromPersonName ?? "",
      extra: (r.contact.customFields && typeof r.contact.customFields === "object" && !Array.isArray(r.contact.customFields) ? r.contact.customFields : {}) as Record<string, string>,
      to: r.contact.email,
      email: r.currentEmail,
      aiUsed: Boolean(r.currentEmail && r.currentEmail.model !== BULK_MODEL && !r.currentEmail.editedByUser),
      status: r.status,
      approvalStatus: r.approvalStatus,
      queued: r.queuedForGeneration,
      displayStatus: bulkRowStatus({
        status: r.status,
        approvalStatus: r.approvalStatus,
        hasEmail: Boolean(r.contact.email),
        hasDraft: Boolean(r.currentEmailId),
        blocked: Boolean(r.generationError),
      }),
      problem: r.generationError,
      errorMessage: r.errorMessage,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
    })),
  };
}

export type BulkRowsResponse = Awaited<ReturnType<typeof listBulkRows>>;
export type BulkRowItem = BulkRowsResponse["items"][number];
export type BulkOverview = Awaited<ReturnType<typeof getBulkOverview>>;
