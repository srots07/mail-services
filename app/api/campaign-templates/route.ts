import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { createTemplate, listTemplates } from "@/lib/services/campaign-templates";
import { templateSchema } from "@/lib/validation/bulk";

export const GET = authedRoute({}, async ({ user }) => ok({ templates: await listTemplates(user.id) }));

export const POST = authedRoute({ rateLimit: RATE_LIMITS.api }, async ({ req, user }) => {
  const input = await readJson(req, templateSchema);
  return ok(await createTemplate(user.id, input));
});
