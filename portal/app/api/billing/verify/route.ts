import { z } from "zod";
import { env } from "@/lib/env";
import { currentUser, sameOrigin } from "@/lib/auth";
import { applyPatch, chargeStartFor, patchForEntity } from "@/lib/billing";
import { checkoutSignatureValid, fetchSubscription } from "@/lib/razorpay";
import { HttpError, handle, json, readJson } from "@/lib/api";

const body = z.union([
  z.object({ mock: z.literal(true), subscriptionId: z.string().min(1) }),
  z.object({ paymentId: z.string().min(1), subscriptionId: z.string().min(1), signature: z.string().min(1) }),
]);

/** Called by the browser right after Razorpay Checkout succeeds; the webhook is the source of truth later. */
export const POST = handle(async (request: Request) => {
  if (!sameOrigin(request)) throw new HttpError(403, "Cross-site request blocked.");
  const user = await currentUser();
  if (!user?.subscription) throw new HttpError(401, "Log in first.");
  const sub = user.subscription;
  const input = body.parse(await readJson(request));
  if (input.subscriptionId !== sub.razorpaySubscriptionId) throw new HttpError(400, "This payment does not match your subscription.");

  if ("mock" in input) {
    if (!env().razorpayMock) throw new HttpError(400, "Simulated payments are disabled.");
    const start = chargeStartFor(sub) ?? new Date();
    const days = sub.plan === "YEARLY" ? 365 : 30;
    await applyPatch(sub.id, { status: "ACTIVE", currentPeriodEnd: new Date(start.getTime() + days * 86_400_000), cancelAtPeriodEnd: false });
    return json({ ok: true });
  }

  if (!checkoutSignatureValid(input.paymentId, input.subscriptionId, input.signature)) {
    throw new HttpError(400, "Payment signature check failed.");
  }
  const entity = await fetchSubscription(input.subscriptionId);
  await applyPatch(sub.id, patchForEntity(entity) ?? { status: "PENDING" });
  return json({ ok: true });
});
