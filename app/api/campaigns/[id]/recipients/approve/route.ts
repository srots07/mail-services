import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { approveRecipients } from "@/lib/services/recipients";
import { idsSchema } from "@/lib/validation/campaigns";

export const POST = authedRoute<{ id: string }>({}, async ({ req, user, params }) => {
  const { ids, all } = await readJson(req, idsSchema);
  const approved = await approveRecipients(user.id, params.id, all ? "all" : (ids ?? []));
  return ok({ approved });
});
