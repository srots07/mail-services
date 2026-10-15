import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { deleteTemplate, getOwnedTemplate, serializeTemplate, updateTemplate } from "@/lib/services/campaign-templates";
import { templateSchema } from "@/lib/validation/bulk";

export const GET = authedRoute<{ id: string }>({}, async ({ user, params }) => ok(serializeTemplate(await getOwnedTemplate(user.id, params.id))));

export const PUT = authedRoute<{ id: string }>({ rateLimit: RATE_LIMITS.api }, async ({ req, user, params }) => {
  const input = await readJson(req, templateSchema);
  return ok(await updateTemplate(user.id, params.id, input));
});

export const DELETE = authedRoute<{ id: string }>({ rateLimit: RATE_LIMITS.api }, async ({ user, params }) => {
  await deleteTemplate(user.id, params.id);
  return ok({ deleted: true });
});
