import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { getBulkOverview, updateBulkSettings } from "@/lib/services/bulk";
import { bulkSettingsSchema } from "@/lib/validation/bulk";

type Params = { id: string };

export const GET = authedRoute<Params>({}, async ({ user, params }) => ok(await getBulkOverview(user.id, params.id)));

export const PUT = authedRoute<Params>({ rateLimit: RATE_LIMITS.api }, async ({ req, user, params }) => {
  const patch = await readJson(req, bulkSettingsSchema);
  await updateBulkSettings(user.id, params.id, patch);
  return ok(await getBulkOverview(user.id, params.id));
});
