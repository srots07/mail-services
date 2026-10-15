import { authedRoute, ok } from "@/lib/api/handler";
import { deleteCampaign } from "@/lib/services/campaigns";

type Params = { id: string };

export const DELETE = authedRoute<Params>({}, async ({ user, params }) => {
  await deleteCampaign(user.id, params.id);
  return ok({ ok: true });
});
