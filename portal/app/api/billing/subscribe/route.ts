import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { currentUser, sameOrigin } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { chargeStartFor } from "@/lib/billing";
import { createSubscription } from "@/lib/razorpay";
import { entitlement } from "@/lib/subscription";
import { HttpError, handle, json, readJson } from "@/lib/api";

const body = z.object({ plan: z.enum(["MONTHLY", "YEARLY"]) });

export const POST = handle(async (request: Request) => {
  if (!sameOrigin(request)) throw new HttpError(403, "Cross-site request blocked.");
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Log in first.");
  const { plan } = body.parse(await readJson(request));
  const sub =
    user.subscription ?? (await db().subscription.create({ data: { userId: user.id, status: "EXPIRED" } }));
  if ((sub.status === "ACTIVE" || sub.status === "PAST_DUE") && entitlement(sub).kind === "paid" && !sub.cancelAtPeriodEnd) {
    throw new HttpError(409, "You already have an active subscription.");
  }
  const startAt = chargeStartFor(sub);

  if (env().razorpayMock) {
    const subscriptionId = `mock_sub_${randomToken(9)}`;
    await db().subscription.update({ where: { id: sub.id }, data: { razorpaySubscriptionId: subscriptionId, plan } });
    return json({ mock: true, subscriptionId });
  }

  const created = await createSubscription({ plan, userId: user.id, startAt });
  await db().subscription.update({ where: { id: sub.id }, data: { razorpaySubscriptionId: created.id, plan } });
  return json({ mock: false, subscriptionId: created.id, keyId: env().RAZORPAY_KEY_ID });
});
