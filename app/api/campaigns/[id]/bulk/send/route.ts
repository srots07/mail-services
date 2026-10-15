import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { bulkApproveAndSend, getBulkSendSummary } from "@/lib/queue/sending";
import { kickWorker } from "@/lib/queue/worker";
import { bulkSendSchema } from "@/lib/validation/bulk";

type Params = { id: string };

export const GET = authedRoute<Params>({}, async ({ user, params }) => ok(await getBulkSendSummary(user.id, params.id)));

/** Final "APPROVE & SEND ALL": the only request that sends a bulk campaign. */
export const POST = authedRoute<Params>({ rateLimit: RATE_LIMITS.send }, async ({ req, user, params }) => {
  const input = await readJson(req, bulkSendSchema);
  const result = await bulkApproveAndSend(user.id, params.id, input);
  kickWorker();
  return ok(result);
});
