import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { notesOf } from "@/lib/billing";
import { webhookSignatureValid } from "@/lib/razorpay";
import { mergePatch, patchForEvent, type RazorpaySubscriptionEntity } from "@/lib/subscription";
import { json } from "@/lib/api";

interface WebhookBody {
  event?: string;
  payload?: { subscription?: { entity?: RazorpaySubscriptionEntity } };
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!webhookSignatureValid(raw, request.headers.get("x-razorpay-signature"))) {
    return json({ error: "Invalid signature." }, 400);
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const eventId = request.headers.get("x-razorpay-event-id") || sha256(raw);
  const event = body.event ?? "";

  if (await db().webhookEvent.findUnique({ where: { id: eventId } })) return json({ ok: true, duplicate: true });

  const entity = body.payload?.subscription?.entity;
  const patch = entity ? patchForEvent(event, entity) : null;
  let target = null;
  if (entity && patch) {
    target = await db().subscription.findUnique({ where: { razorpaySubscriptionId: entity.id } });
    const userId = notesOf(entity).userId;
    if (!target && userId) target = await db().subscription.findUnique({ where: { userId } });
  }

  try {
    if (target && entity && patch) {
      const plan = notesOf(entity).plan;
      await db().$transaction([
        db().webhookEvent.create({ data: { id: eventId, event } }),
        db().subscription.update({
          where: { id: target.id },
          data: {
            ...mergePatch(target, patch),
            razorpaySubscriptionId: entity.id,
            ...(plan === "MONTHLY" || plan === "YEARLY" ? { plan } : {}),
          },
        }),
      ]);
    } else {
      await db().webhookEvent.create({ data: { id: eventId, event } });
    }
  } catch (err) {
    // A concurrent delivery of the same event already recorded it.
    if ((err as { code?: string }).code === "P2002") return json({ ok: true, duplicate: true });
    throw err;
  }
  return json({ ok: true, applied: !!target });
}
