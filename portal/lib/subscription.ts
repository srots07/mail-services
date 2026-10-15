/** Pure subscription rules (no database / framework imports, so they are unit-testable). */

export type SubStatus = "TRIAL" | "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
export type PlanName = "MONTHLY" | "YEARLY";

export interface SubscriptionLike {
  status: SubStatus;
  plan: PlanName | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

/** Days a failed renewal keeps working while Razorpay retries the card. */
export const PAST_DUE_GRACE_DAYS = 3;

export interface Entitlement {
  /** Sending allowed right now. */
  active: boolean;
  /** "trial" while only the free trial covers today, "paid" once a paid period covers it. */
  kind: "trial" | "paid" | "none";
  until: Date | null;
}

export function entitlement(sub: SubscriptionLike | null, now = new Date()): Entitlement {
  if (!sub) return { active: false, kind: "none", until: null };
  let paidUntil: Date | null = null;
  if (sub.currentPeriodEnd) {
    if (sub.status === "ACTIVE" || sub.status === "CANCELLED") paidUntil = sub.currentPeriodEnd;
    if (sub.status === "PAST_DUE") paidUntil = new Date(sub.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000);
  }
  const trialUntil = sub.status !== "EXPIRED" ? sub.trialEndsAt : null;
  const paidActive = !!paidUntil && paidUntil > now;
  const trialActive = !!trialUntil && trialUntil > now;
  if (paidActive) {
    const until = trialActive && trialUntil! > paidUntil! ? trialUntil : paidUntil;
    return { active: true, kind: "paid", until };
  }
  if (trialActive) return { active: true, kind: "trial", until: trialUntil };
  return { active: false, kind: "none", until: paidUntil ?? trialUntil ?? null };
}

export interface RazorpaySubscriptionEntity {
  id: string;
  status?: string;
  plan_id?: string;
  current_end?: number | null;
  notes?: Record<string, string> | unknown[] | null;
}

export interface SubscriptionPatch {
  status?: SubStatus;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

/** Translate a Razorpay `subscription.*` webhook event into a change to our record. */
export function patchForEvent(event: string, entity: RazorpaySubscriptionEntity): SubscriptionPatch | null {
  const periodEnd = entity.current_end ? new Date(entity.current_end * 1000) : undefined;
  switch (event) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      return { status: "ACTIVE", currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false };
    case "subscription.authenticated":
      return { status: "PENDING" };
    case "subscription.pending":
      return { status: "PAST_DUE", currentPeriodEnd: periodEnd };
    case "subscription.cancelled":
      return { status: "CANCELLED", currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false };
    case "subscription.halted":
    case "subscription.completed":
    case "subscription.paused":
      return { status: "EXPIRED" };
    case "subscription.updated":
      return periodEnd ? { currentPeriodEnd: periodEnd } : null;
    default:
      return null;
  }
}

/** Never let a patch shorten a paid period we already granted (events can arrive out of order). */
export function mergePatch(current: SubscriptionLike, patch: SubscriptionPatch): SubscriptionPatch {
  const merged = { ...patch };
  if (merged.currentPeriodEnd && current.currentPeriodEnd && merged.currentPeriodEnd < current.currentPeriodEnd) {
    delete merged.currentPeriodEnd;
  }
  if (merged.status === "PENDING" && (current.status === "ACTIVE" || current.status === "PAST_DUE")) {
    delete merged.status;
  }
  return merged;
}
