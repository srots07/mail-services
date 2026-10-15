import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { setRecipientEmail } from "@/lib/services/bulk";
import { recipientEmailSchema } from "@/lib/validation/bulk";

type Params = { id: string; rid: string };

export const PUT = authedRoute<Params>({ rateLimit: RATE_LIMITS.api }, async ({ req, user, params }) => {
  const input = await readJson(req, recipientEmailSchema);
  await setRecipientEmail(user.id, params.id, params.rid, input);
  return ok({ ok: true });
});
