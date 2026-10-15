import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { sendTestEmail } from "@/lib/queue/sending";
import { testEmailSchema } from "@/lib/validation/campaigns";

export const POST = authedRoute<{ id: string }>({ rateLimit: RATE_LIMITS.testEmail }, async ({ req, user, params }) => {
  const { campaignContactId, to } = await readJson(req, testEmailSchema);
  return ok(await sendTestEmail(user.id, params.id, campaignContactId, to));
});
