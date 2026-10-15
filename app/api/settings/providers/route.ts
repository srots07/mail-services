import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { getProviderSettings, setProviderSettings } from "@/lib/services/providers";
import { logActivity } from "@/lib/services/logs";
import { providerSettingsSchema } from "@/lib/validation/campaigns";

export const GET = authedRoute({}, async ({ user }) => ok(await getProviderSettings(user.id)));

export const PUT = authedRoute({}, async ({ req, user }) => {
  const input = await readJson(req, providerSettingsSchema);
  const settings = await setProviderSettings(user.id, input);
  await logActivity({ category: "AUTH", userId: user.id, message: `Providers set: AI=${settings.ai}, Email=${settings.email}, Research=${settings.research}` });
  return ok(settings);
});
