import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import type { RazorpaySubscriptionEntity } from "@/lib/subscription";

const API = "https://api.razorpay.com/v1";

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!res.ok) throw new Error(`Razorpay ${path}: ${data.error?.description ?? res.status}`);
  return data;
}

export function planId(plan: "MONTHLY" | "YEARLY"): string {
  const id = plan === "YEARLY" ? env().RAZORPAY_PLAN_YEARLY : env().RAZORPAY_PLAN_MONTHLY;
  if (!id) throw new Error(`RAZORPAY_PLAN_${plan} is not configured.`);
  return id;
}

export function createSubscription(input: { plan: "MONTHLY" | "YEARLY"; userId: string; startAt?: Date }) {
  return call<RazorpaySubscriptionEntity>("POST", "/subscriptions", {
    plan_id: planId(input.plan),
    // Razorpay requires a finite cycle count: 10 years either way.
    total_count: input.plan === "YEARLY" ? 10 : 120,
    customer_notify: 1,
    ...(input.startAt ? { start_at: Math.floor(input.startAt.getTime() / 1000) } : {}),
    notes: { userId: input.userId, plan: input.plan },
  });
}

export function fetchSubscription(id: string) {
  return call<RazorpaySubscriptionEntity>("GET", `/subscriptions/${encodeURIComponent(id)}`);
}

export function cancelSubscription(id: string) {
  return call<RazorpaySubscriptionEntity>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 1 });
}

function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Checkout success: signature = HMAC_SHA256(payment_id + "|" + subscription_id, key_secret). */
export function checkoutSignatureValid(paymentId: string, subscriptionId: string, signature: string, secret = env().RAZORPAY_KEY_SECRET): boolean {
  if (!secret || !signature) return false;
  return safeEqual(hmacHex(secret, `${paymentId}|${subscriptionId}`), signature);
}

/** Webhook: X-Razorpay-Signature = HMAC_SHA256(raw body, webhook secret). */
export function webhookSignatureValid(rawBody: string, signature: string | null, secret = env().RAZORPAY_WEBHOOK_SECRET): boolean {
  if (!secret || !signature) return false;
  return safeEqual(hmacHex(secret, rawBody), signature);
}
