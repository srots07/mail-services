import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { currentUser, sameOrigin } from "@/lib/auth";
import { cancelSubscription } from "@/lib/razorpay";
import { HttpError, handle, json } from "@/lib/api";

export const POST = handle(async (request: Request) => {
  if (!sameOrigin(request)) throw new HttpError(403, "Cross-site request blocked.");
  const user = await currentUser();
  const sub = user?.subscription;
  if (!sub?.razorpaySubscriptionId || !["ACTIVE", "PAST_DUE", "PENDING"].includes(sub.status)) {
    throw new HttpError(400, "There is no active subscription to cancel.");
  }
  if (!env().razorpayMock) await cancelSubscription(sub.razorpaySubscriptionId);
  // Access continues to the period end; the `subscription.cancelled` webhook finalises the status.
  await db().subscription.update({
    where: { id: sub.id },
    data: env().razorpayMock || sub.status === "PENDING" ? { status: "CANCELLED", cancelAtPeriodEnd: false } : { cancelAtPeriodEnd: true },
  });
  return json({ ok: true });
});
