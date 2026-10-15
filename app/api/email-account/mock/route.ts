import { authedRoute, ok } from "@/lib/api/handler";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/services/logs";
import { getProviderSettings } from "@/lib/services/providers";

/** Development only: connects a mock sender account. Disabled in production. */
export const POST = authedRoute({}, async ({ user }) => {
  if (env().isProduction) throw new AppError("FORBIDDEN", "The mock email provider is only available in development.");
  if ((await getProviderSettings(user.id)).email !== "mock") {
    throw new AppError("INVALID_STATE", "Select the Mock email provider in Settings before connecting a mock sender.");
  }
  await db().emailAccount.upsert({
    where: { userId_provider: { userId: user.id, provider: "MOCK" } },
    create: { userId: user.id, provider: "MOCK", email: user.email, displayName: user.name ? `${user.name} (mock)` : "Mock sender" },
    update: {},
  });
  await logActivity({ category: "AUTH", userId: user.id, message: "Mock email account connected (development only)" });
  return ok({ ok: true });
});
