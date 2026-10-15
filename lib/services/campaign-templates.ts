import "server-only";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import type { CampaignTemplate } from "@/lib/generated/prisma/client";
import { logActivity } from "./logs";
import { getOwnedProfile } from "./sender-profiles";

export interface TemplateInput {
  name: string;
  body: string;
  subjectMode: "FIXED" | "AI";
  subjectTemplate: string | null;
  senderProfileId?: string | null;
  aiPersonalization: boolean;
  aiInstructions: string | null;
  productLineFallback: string | null;
  ccEmails?: string[];
}

export function serializeTemplate(t: CampaignTemplate) {
  return {
    id: t.id,
    name: t.name,
    body: t.body,
    subjectMode: t.subjectMode,
    subjectTemplate: t.subjectTemplate,
    senderProfileId: t.senderProfileId,
    aiPersonalization: t.aiPersonalization,
    aiInstructions: t.aiInstructions,
    productLineFallback: t.productLineFallback,
    ccEmails: t.ccEmails,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTemplates(userId: string) {
  const rows = await db().campaignTemplate.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return rows.map(serializeTemplate);
}

export async function getOwnedTemplate(userId: string, id: string) {
  const t = await db().campaignTemplate.findFirst({ where: { id, userId } });
  if (!t) throw new AppError("NOT_FOUND", "Template not found.");
  return t;
}

async function checkProfile(userId: string, id: string | null | undefined) {
  if (id) await getOwnedProfile(userId, id);
}

export async function createTemplate(userId: string, input: TemplateInput) {
  await checkProfile(userId, input.senderProfileId);
  if (input.subjectMode === "FIXED" && !input.subjectTemplate) throw new AppError("VALIDATION", "Enter a subject template, or choose AI subjects.");
  const t = await db().campaignTemplate.create({ data: { userId, ...input, senderProfileId: input.senderProfileId ?? null } });
  await logActivity({ category: "CAMPAIGN_STATE", userId, message: `Campaign template "${t.name}" saved` });
  return serializeTemplate(t);
}

export async function updateTemplate(userId: string, id: string, input: TemplateInput) {
  await getOwnedTemplate(userId, id);
  await checkProfile(userId, input.senderProfileId);
  const t = await db().campaignTemplate.update({ where: { id }, data: { ...input, senderProfileId: input.senderProfileId ?? null } });
  await logActivity({ category: "CAMPAIGN_STATE", userId, message: `Campaign template "${t.name}" updated` });
  return serializeTemplate(t);
}

export async function deleteTemplate(userId: string, id: string) {
  const t = await getOwnedTemplate(userId, id);
  await db().campaignTemplate.delete({ where: { id } });
  await logActivity({ category: "CAMPAIGN_STATE", userId, message: `Campaign template "${t.name}" deleted` });
}
