import "server-only";
import type { BulkSender } from "@/lib/bulk/placeholders";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import type { SenderProfile } from "@/lib/generated/prisma/client";
import { logActivity } from "./logs";
import { getActiveEmailAccount } from "./providers";

export interface SenderProfileInput {
  label?: string;
  senderName: string;
  designation: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  isDefault?: boolean;
}

export function toBulkSender(p: Pick<SenderProfile, "senderName" | "designation" | "companyName" | "email" | "phone" | "website">): BulkSender {
  return { senderName: p.senderName, designation: p.designation, companyName: p.companyName, email: p.email, phone: p.phone, website: p.website };
}

export function serializeProfile(p: SenderProfile) {
  return {
    id: p.id,
    label: p.label,
    senderName: p.senderName,
    designation: p.designation,
    companyName: p.companyName,
    email: p.email,
    phone: p.phone,
    website: p.website,
    isDefault: p.isDefault,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function listSenderProfiles(userId: string) {
  const [profiles, account] = await Promise.all([
    db().senderProfile.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    getActiveEmailAccount(userId),
  ]);
  return { profiles: profiles.map(serializeProfile), connectedEmail: account?.email ?? null };
}

export async function getOwnedProfile(userId: string, id: string) {
  const p = await db().senderProfile.findFirst({ where: { id, userId } });
  if (!p) throw new AppError("NOT_FOUND", "Sender profile not found.");
  return p;
}

export async function getDefaultProfile(userId: string) {
  return db().senderProfile.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
}

/** The first profile is always the default; making another one default clears the old flag. */
export async function createSenderProfile(userId: string, input: SenderProfileInput) {
  const count = await db().senderProfile.count({ where: { userId } });
  const isDefault = count === 0 || input.isDefault === true;
  const account = input.email ? null : await getActiveEmailAccount(userId);
  const profile = await db().$transaction(async (tx) => {
    if (isDefault) await tx.senderProfile.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.senderProfile.create({
      data: {
        userId,
        label: input.label?.trim() || input.senderName,
        senderName: input.senderName,
        designation: input.designation,
        companyName: input.companyName,
        email: input.email ?? account?.email ?? null,
        phone: input.phone,
        website: input.website,
        isDefault,
      },
    });
  });
  await logActivity({ category: "CAMPAIGN_STATE", userId, message: `Sender profile "${profile.label}" created${isDefault ? " (default)" : ""}` });
  return serializeProfile(profile);
}

export async function updateSenderProfile(userId: string, id: string, input: SenderProfileInput) {
  await getOwnedProfile(userId, id);
  const profile = await db().$transaction(async (tx) => {
    if (input.isDefault) await tx.senderProfile.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } });
    return tx.senderProfile.update({
      where: { id },
      data: {
        label: input.label?.trim() || input.senderName,
        senderName: input.senderName,
        designation: input.designation,
        companyName: input.companyName,
        email: input.email,
        phone: input.phone,
        website: input.website,
        ...(input.isDefault ? { isDefault: true } : {}),
      },
    });
  });
  await logActivity({ category: "CAMPAIGN_STATE", userId, message: `Sender profile "${profile.label}" updated` });
  return serializeProfile(profile);
}

export async function deleteSenderProfile(userId: string, id: string) {
  const p = await getOwnedProfile(userId, id);
  await db().senderProfile.delete({ where: { id } });
  if (p.isDefault) {
    const next = await db().senderProfile.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
    if (next) await db().senderProfile.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  await logActivity({ category: "CAMPAIGN_STATE", userId, message: `Sender profile "${p.label}" deleted` });
}
