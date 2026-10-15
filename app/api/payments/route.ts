import { z } from "zod";
import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { getUserCredits, listUserPayments, listAllPayments, submitUpiPayment, updateUpiConfig } from "@/lib/services/credits";
import { logActivity } from "@/lib/services/logs";
import { AppError } from "@/lib/errors";

const submitSchema = z.object({
  utr: z.string().trim().min(6, "UTR / Reference number must be at least 6 characters"),
  screenshotData: z.string().optional(),
});

const configSchema = z.object({
  upiId: z.string().trim().optional(),
  upiName: z.string().trim().optional(),
  amountInr: z.coerce.number().min(1).optional(),
});

export const GET = authedRoute({}, async ({ user }) => {
  const credits = await getUserCredits(user.id);
  const history = user.isAdmin ? await listAllPayments() : await listUserPayments(user.id);
  return ok({ credits, history, isAdmin: user.isAdmin });
});

export const POST = authedRoute({}, async ({ req, user }) => {
  const input = await readJson(req, submitSchema);
  const result = await submitUpiPayment(user.id, input);
  await logActivity({
    category: "AUTH",
    userId: user.id,
    message: `Payment submitted (UTR: ${input.utr}): +${result.creditsAdded} credits unlocked`,
  });
  return ok(result);
});

export const PUT = authedRoute({}, async ({ req, user }) => {
  if (!user.isAdmin) {
    throw new AppError("FORBIDDEN", "Only the main owner/administrator can update payment settings.");
  }
  const input = await readJson(req, configSchema);
  const result = await updateUpiConfig(input);
  await logActivity({
    category: "AUTH",
    userId: user.id,
    message: `UPI settings updated: ${input.upiId ?? ""}`,
  });
  return ok(result);
});

