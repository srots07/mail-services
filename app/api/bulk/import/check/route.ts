import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { checkBulkImport } from "@/lib/services/bulk";
import { bulkCheckSchema } from "@/lib/validation/bulk";

export const POST = authedRoute({ rateLimit: RATE_LIMITS.import }, async ({ req }) => {
  const input = await readJson(req, bulkCheckSchema);
  return ok(checkBulkImport(input));
});
