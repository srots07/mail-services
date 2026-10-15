import { authedRoute, ok } from "@/lib/api/handler";
import { getProviderStatus } from "@/lib/services/providers";

/** Live connection status of the selected providers (never includes key or token material). */
export const GET = authedRoute({}, async ({ req, user }) => {
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  return ok(await getProviderStatus(user.id, { force }));
});
