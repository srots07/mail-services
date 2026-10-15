import { authedRoute, ok } from "@/lib/api/handler";
import { destroySession } from "@/lib/auth/session";
import { logActivity } from "@/lib/services/logs";

export const POST = authedRoute({}, async ({ user }) => {
  await destroySession();
  await logActivity({ category: "AUTH", userId: user.id, message: "Signed out" });
  return ok({ ok: true });
});
