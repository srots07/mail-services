import "server-only";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { leftoverPlaceholders } from "@/lib/bulk/placeholders";
import { getOwnedCampaign, refreshCampaignCounters } from "./campaigns";
import { logActivity } from "./logs";

async function getOwnedRecipient(userId: string, campaignId: string, recipientId: string) {
  const r = await db().campaignContact.findFirst({
    where: { id: recipientId, campaignId, campaign: { userId } },
    include: { currentEmail: true, campaign: true, contact: true },
  });
  if (!r) throw new AppError("NOT_FOUND", "Recipient not found.");
  return r;
}

export async function editRecipientEmail(
  userId: string,
  campaignId: string,
  recipientId: string,
  input: { subject: string; body: string; approve?: boolean },
) {
  const r = await getOwnedRecipient(userId, campaignId, recipientId);
  if (["SENT", "SENDING", "GENERATING", "SKIPPED"].includes(r.status)) {
    throw new AppError("INVALID_STATE", `This email cannot be edited while it is ${r.status.toLowerCase()}.`);
  }
  if (r.campaign.status === "COMPLETED") throw new AppError("INVALID_STATE", "This campaign has finished; emails can no longer be edited.");
  if (r.campaign.status === "RUNNING" || r.campaign.status === "SCHEDULED") {
    throw new AppError("INVALID_STATE", "Pause the campaign before editing emails.");
  }
  if (!r.currentEmail) throw new AppError("INVALID_STATE", "Generate this email before editing it.");

  const approve = Boolean(input.approve);
  const bulkProblems = bulkEditProblems(input.subject, input.body);
  if (approve && bulkProblems.length) throw new AppError("VALIDATION", `Fix before approving: ${bulkProblems.join("; ")}`);
  await db().$transaction(async (tx) => {
    const last = await tx.generatedEmail.aggregate({ where: { campaignContactId: r.id }, _max: { version: true } });
    const email = await tx.generatedEmail.create({
      data: {
        campaignContactId: r.id,
        version: (last._max.version ?? 0) + 1,
        subject: input.subject,
        body: input.body,
        model: r.currentEmail!.model,
        promptVersion: r.currentEmail!.promptVersion,
        promptSnapshot: r.currentEmail!.promptSnapshot,
        editedByUser: true,
      },
    });
    await tx.campaignContact.update({
      where: { id: r.id },
      data: {
        currentEmailId: email.id,
        approvalStatus: approve ? "APPROVED" : "PENDING",
        // An edited email must be re-scheduled explicitly (resume / schedule), never sent on an old slot.
        status: "READY",
        scheduledAt: null,
        generationError: bulkProblems.length ? bulkProblems.join("; ") : null,
        errorMessage: null,
      },
    });
  });
  await refreshCampaignCounters(campaignId);
  await logActivity({
    category: "CAMPAIGN_STATE",
    userId,
    campaignId,
    message: `Email for ${r.contact.email ?? r.contact.toPersonName ?? "recipient"} edited manually${approve ? " and approved" : " (approval reset to pending)"}`,
  });
  return { problems: bulkProblems };
}

function bulkEditProblems(subject: string, body: string): string[] {
  const problems: string[] = [];
  if (!subject.trim()) problems.push("Subject is empty");
  if (subject.length > 200) problems.push("Subject is longer than 200 characters");
  if (!body.trim()) problems.push("Body is empty");
  const left = [...new Set([...leftoverPlaceholders(subject), ...leftoverPlaceholders(body)])];
  if (left.length) problems.push(`Unreplaced placeholders: ${left.join(", ")}`);
  return problems;
}

export async function approveRecipients(userId: string, campaignId: string, ids: string[] | "all"): Promise<number> {
  const campaign = await getOwnedCampaign(userId, campaignId);
  if (campaign.status === "COMPLETED") throw new AppError("INVALID_STATE", "This campaign has finished.");
  // Approval only marks the email as reviewed; it is sent only after the user schedules the campaign.
  const res = await db().campaignContact.updateMany({
    where: {
      campaignId,
      ...(ids === "all" ? {} : { id: { in: ids } }),
      status: "READY",
      approvalStatus: { not: "APPROVED" },
      currentEmailId: { not: null },
      generationError: null,
      contact: { email: { not: null } },
      NOT: { emailSource: "MANUAL", emailApprovedAt: null },
    },
    data: { approvalStatus: "APPROVED" },
  });
  await refreshCampaignCounters(campaignId);
  if (res.count) await logActivity({ category: "CAMPAIGN_STATE", userId, campaignId, message: `Approved ${res.count} emails` });
  return res.count;
}

export async function rejectRecipients(userId: string, campaignId: string, ids: string[]): Promise<number> {
  await getOwnedCampaign(userId, campaignId);
  const res = await db().campaignContact.updateMany({
    where: { campaignId, id: { in: ids }, status: { in: ["READY", "SCHEDULED"] }, currentEmailId: { not: null } },
    data: { approvalStatus: "REJECTED", status: "READY", scheduledAt: null },
  });
  await refreshCampaignCounters(campaignId);
  if (res.count) await logActivity({ category: "CAMPAIGN_STATE", userId, campaignId, message: `Rejected ${res.count} emails` });
  return res.count;
}
