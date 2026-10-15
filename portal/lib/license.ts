import "server-only";
import { env } from "@/lib/env";
import { buildPayload, signLicense } from "@/lib/license-core";
import { entitlement, type SubscriptionLike } from "@/lib/subscription";

export function issueLicense(user: { id: string; email: string }, sub: SubscriptionLike | null, deviceId: string): string {
  const key = env().LICENSE_SIGNING_KEY;
  if (!key) throw new Error("LICENSE_SIGNING_KEY is not configured. Run `npm run license:keygen`.");
  const ent = entitlement(sub);
  return signLicense(
    buildPayload({ userId: user.id, email: user.email, deviceId, kind: ent.active ? ent.kind : "none", entitledUntil: ent.active ? ent.until : null }),
    key,
  );
}
