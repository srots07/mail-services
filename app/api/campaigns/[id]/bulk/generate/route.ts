import { z } from "zod";
import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { kickWorker } from "@/lib/queue/worker";
import { generateBulk } from "@/lib/services/bulk";

type Params = { id: string };

const schema = z.object({
  mode: z.enum(["all", "missing", "selected", "failed"]).default("all"),
  ids: z.array(z.string().max(64)).max(10_000).optional(),
});

export const POST = authedRoute<Params>({ rateLimit: RATE_LIMITS.generate }, async ({ req, user, params }) => {
  const input = await readJson(req, schema);
  const result = await generateBulk(user.id, params.id, input);
  if (result.queued) kickWorker();
  return ok(result);
});
