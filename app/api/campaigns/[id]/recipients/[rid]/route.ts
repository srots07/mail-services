import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { editRecipientEmail } from "@/lib/services/recipients";
import { editEmailSchema } from "@/lib/validation/campaigns";

export const PATCH = authedRoute<{ id: string; rid: string }>({}, async ({ req, user, params }) => {
  const input = await readJson(req, editEmailSchema);
  await editRecipientEmail(user.id, params.id, params.rid, input);
  return ok({ ok: true });
});
