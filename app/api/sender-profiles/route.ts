import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { createSenderProfile, listSenderProfiles } from "@/lib/services/sender-profiles";
import { senderProfileSchema } from "@/lib/validation/bulk";

export const GET = authedRoute({}, async ({ user }) => ok(await listSenderProfiles(user.id)));

export const POST = authedRoute({ rateLimit: RATE_LIMITS.api }, async ({ req, user }) => {
  const input = await readJson(req, senderProfileSchema);
  return ok(await createSenderProfile(user.id, input));
});
