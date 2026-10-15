import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { rejectRecipients } from "@/lib/services/recipients";
import { idsSchema } from "@/lib/validation/campaigns";

export const POST = authedRoute<{ id: string }>({}, async ({ req, user, params }) => {
  const { ids } = await readJson(req, idsSchema);
  const rejected = await rejectRecipients(user.id, params.id, ids ?? []);
  return ok({ rejected });
});
