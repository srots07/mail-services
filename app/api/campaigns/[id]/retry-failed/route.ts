import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { retryFailedSends } from "@/lib/queue/sending";
import { kickWorker } from "@/lib/queue/worker";
import { idsSchema } from "@/lib/validation/campaigns";

export const POST = authedRoute<{ id: string }>({ rateLimit: RATE_LIMITS.send }, async ({ req, user, params }) => {
  const { ids } = await readJson(req, idsSchema);
  const retried = await retryFailedSends(user.id, params.id, ids);
  kickWorker();
  return ok({ retried });
});
