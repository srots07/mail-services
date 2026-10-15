import "server-only";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/database/prisma";
import { env, invalidateEnvCache } from "@/lib/env";
import { AppError } from "@/lib/errors";

export interface UserCreditsInfo {
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  canRunCampaign: boolean;
  upiId: string;
  upiName: string;
  amountInr: number;
  creditsPerPack: number;
  upiIntentUrl: string;
}

export function generateUpiIntentUrl(upiId: string, name: string, amount: number, note = "5 Campaign Credits"): string {
  const cleanId = upiId.trim();
  const cleanName = encodeURIComponent(name.trim());
  const cleanNote = encodeURIComponent(note);
  return `upi://pay?pa=${cleanId}&pn=${cleanName}&am=${amount}&cu=INR&tn=${cleanNote}`;
}

export async function getUserCredits(userId: string): Promise<UserCreditsInfo> {
  const e = env();
  const user = await db().user.findUnique({
    where: { id: userId },
    select: { campaignCredits: true, campaignsUsed: true },
  });

  const total = user?.campaignCredits ?? e.FREE_TRIAL_CREDITS;
  const used = user?.campaignsUsed ?? 0;
  const remaining = Math.max(0, total - used);

  const upiId = e.UPI_ID || "owner@upi";
  const upiName = e.UPI_NAME || "Sorts Outreach";
  const amountInr = e.UPI_AMOUNT_INR || 85;
  const creditsPerPack = e.CREDITS_PER_PAYMENT || 5;

  return {
    totalCredits: total,
    usedCredits: used,
    remainingCredits: remaining,
    canRunCampaign: remaining > 0,
    upiId,
    upiName,
    amountInr,
    creditsPerPack,
    upiIntentUrl: generateUpiIntentUrl(upiId, upiName, amountInr),
  };
}

export async function assertCanRunCampaign(userId: string): Promise<void> {
  const info = await getUserCredits(userId);
  if (!info.canRunCampaign) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `You have used all your ${info.totalCredits} campaign runs. Please top up $1 (₹${info.amountInr}) via UPI to get 5 more runs.`,
      {
        remainingCredits: 0,
        amountInr: info.amountInr,
        upiId: info.upiId,
      },
    );
  }
}

export async function recordCampaignRun(userId: string): Promise<number> {
  const updated = await db().user.update({
    where: { id: userId },
    data: { campaignsUsed: { increment: 1 } },
    select: { campaignCredits: true, campaignsUsed: true },
  });
  return Math.max(0, updated.campaignCredits - updated.campaignsUsed);
}

export async function submitUpiPayment(
  userId: string,
  input: { utr: string; screenshotData?: string },
): Promise<{ success: boolean; creditsAdded: number; newRemaining: number; paymentId: string }> {
  const cleanUtr = input.utr.trim();
  if (cleanUtr.length < 6) {
    throw new AppError("VALIDATION", "Please enter a valid UPI Reference / UTR Number (usually 12 digits).");
  }

  // Prevent duplicate submissions of the exact same UTR
  const existing = await db().upiPayment.findFirst({
    where: { utr: cleanUtr },
  });
  if (existing) {
    throw new AppError("VALIDATION", "This UPI transaction ID has already been credited.");
  }

  const e = env();
  const creditsToAdd = e.CREDITS_PER_PAYMENT || 5;
  const amount = e.UPI_AMOUNT_INR || 85;

  const [payment, updatedUser] = await db().$transaction([
    db().upiPayment.create({
      data: {
        userId,
        amount,
        creditsGranted: creditsToAdd,
        utr: cleanUtr,
        screenshotData: input.screenshotData?.slice(0, 500_000) ?? null,
        status: "VERIFIED",
      },
    }),
    db().user.update({
      where: { id: userId },
      data: { campaignCredits: { increment: creditsToAdd } },
      select: { campaignCredits: true, campaignsUsed: true },
    }),
  ]);

  const newRemaining = Math.max(0, updatedUser.campaignCredits - updatedUser.campaignsUsed);

  return {
    success: true,
    creditsAdded: creditsToAdd,
    newRemaining,
    paymentId: payment.id,
  };
}

export async function listUserPayments(userId: string) {
  return db().upiPayment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      amount: true,
      creditsGranted: true,
      utr: true,
      status: true,
      createdAt: true,
      screenshotData: true,
    },
  });
}

export async function listAllPayments() {
  return db().upiPayment.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      amount: true,
      creditsGranted: true,
      utr: true,
      status: true,
      createdAt: true,
      screenshotData: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });
}

export async function updateUpiConfig(input: { upiId?: string; upiName?: string; amountInr?: number }) {
  const cleanId = input.upiId?.trim();
  const cleanName = input.upiName?.trim();
  const amount = input.amountInr;

  if (cleanId) process.env.UPI_ID = cleanId;
  if (cleanName) process.env.UPI_NAME = cleanName;
  if (amount) process.env.UPI_AMOUNT_INR = String(amount);

  try {
    const envPath = join(process.cwd(), ".env");
    let content = readFileSync(envPath, "utf-8");

    if (cleanId) {
      content = content.replace(/^UPI_ID=.*$/m, `UPI_ID="${cleanId}"`);
    }
    if (cleanName) {
      content = content.replace(/^UPI_NAME=.*$/m, `UPI_NAME="${cleanName}"`);
    }
    if (amount) {
      content = content.replace(/^UPI_AMOUNT_INR=.*$/m, `UPI_AMOUNT_INR=${amount}`);
    }

    writeFileSync(envPath, content, "utf-8");
  } catch (err) {
    console.error("[UPI Settings] Failed to write .env:", err);
  }

  invalidateEnvCache();
  return { ok: true, upiId: process.env.UPI_ID, upiName: process.env.UPI_NAME };
}
