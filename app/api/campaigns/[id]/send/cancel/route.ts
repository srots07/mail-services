import { authedRoute, ok } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { cancelCampaign } from "@/lib/queue/sending";

export const POST = authedRoute<{ id: string }>({ rateLimit: RATE_LIMITS.send }, async ({ user, params }) => {
  const skipped = await cancelCampaign(user.id, params.id);
  return ok({ skipped });
});
