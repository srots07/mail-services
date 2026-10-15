import "server-only";
import { db } from "@/lib/db";
import { mergePatch, patchForEvent, type RazorpaySubscriptionEntity, type SubscriptionPatch } from "@/lib/subscription";

/** Razorpay subscription states (from the API, not webhooks) mapped to the event that would produce them. */
const STATUS_EVENT: Record<string, string> = {
  authenticated: "subscription.authenticated",
  active: "subscription.activated",
  pending: "subscription.pending",
  halted: "subscription.halted",
  cancelled: "subscription.cancelled",
  completed: "subscription.completed",
  paused: "subscription.paused",
};

export function patchForEntity(entity: RazorpaySubscriptionEntity): SubscriptionPatch | null {
  const event = entity.status ? STATUS_EVENT[entity.status] : undefined;
  return event ? patchForEvent(event, entity) : null;
}

export function notesOf(entity: RazorpaySubscriptionEntity): Record<string, string> {
  return entity.notes && !Array.isArray(entity.notes) ? (entity.notes as Record<string, string>) : {};
}

export async function applyPatch(subscriptionRowId: string, patch: SubscriptionPatch | null, extra: { plan?: "MONTHLY" | "YEARLY" } = {}) {
  const current = await db().subscription.findUniqueOrThrow({ where: { id: subscriptionRowId } });
  const merged = patch ? mergePatch(current, patch) : {};
  return db().subscription.update({ where: { id: subscriptionRowId }, data: { ...merged, ...extra } });
}

/** Earliest moment a new paid subscription should start charging (after any time already covered). */
export function chargeStartFor(sub: { status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null }, now = new Date()): Date | undefined {
  const candidates = [sub.status !== "EXPIRED" ? sub.trialEndsAt : null, sub.status === "CANCELLED" ? sub.currentPeriodEnd : null]
    .filter((d): d is Date => !!d && d.getTime() > now.getTime() + 5 * 60_000);
  if (!candidates.length) return undefined;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}
