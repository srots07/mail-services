import { authedRoute, ok } from "@/lib/api/handler";
import { env } from "@/lib/env";
import { licenseState } from "@/lib/license";
import { LICENSE_MESSAGES } from "@/lib/license-verify";

/** Subscription state for the banner and the Send step lock. */
export const GET = authedRoute({}, async () => {
  const state = licenseState();
  const { PORTAL_URL, desktopMode } = env();
  return ok({
    ...state,
    message: LICENSE_MESSAGES[state.state],
    portalUrl: PORTAL_URL || null,
    desktop: desktopMode,
  });
});
