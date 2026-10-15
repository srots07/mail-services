import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { deleteSenderProfile, updateSenderProfile } from "@/lib/services/sender-profiles";
import { senderProfileSchema } from "@/lib/validation/bulk";

export const PUT = authedRoute<{ id: string }>({ rateLimit: RATE_LIMITS.api }, async ({ req, user, params }) => {
  const input = await readJson(req, senderProfileSchema);
  return ok(await updateSenderProfile(user.id, params.id, input));
});

export const DELETE = authedRoute<{ id: string }>({ rateLimit: RATE_LIMITS.api }, async ({ user, params }) => {
  await deleteSenderProfile(user.id, params.id);
  return ok({ deleted: true });
});
