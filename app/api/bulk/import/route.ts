import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { importBulkCampaign } from "@/lib/services/bulk";
import { bulkImportSchema } from "@/lib/validation/bulk";

export const POST = authedRoute({ rateLimit: RATE_LIMITS.import }, async ({ req, user }) => {
  const input = await readJson(req, bulkImportSchema);
  return ok(await importBulkCampaign(user.id, input), { status: 201 });
});
