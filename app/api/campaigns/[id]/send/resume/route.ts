import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { resumeSending } from "@/lib/queue/sending";
import { kickWorker } from "@/lib/queue/worker";
import { resumeSchema } from "@/lib/validation/campaigns";

export const POST = authedRoute<{ id: string }>({ rateLimit: RATE_LIMITS.send }, async ({ req, user, params }) => {
  const input = await readJson(req, resumeSchema);
  const result = await resumeSending(user.id, params.id, { intervalSeconds: input.intervalSeconds });
  kickWorker();
  return ok(result);
});
