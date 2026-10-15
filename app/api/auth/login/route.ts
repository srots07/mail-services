import { ok, publicRoute, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/services/logs";
import { loginSchema } from "@/lib/validation/auth";

export const POST = publicRoute({ rateLimit: RATE_LIMITS.auth }, async ({ req }) => {
  const input = await readJson(req, loginSchema);
  const user = await db().user.findUnique({ where: { email: input.email } });
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    await logActivity({
      category: "AUTH",
      level: "WARN",
      userId: user?.id ?? null,
      message: `Failed sign-in attempt for ${input.email}`,
    });
    throw new AppError("UNAUTHORIZED", "Incorrect email or password.");
  }
  await createSession(user.id, req.headers.get("user-agent"));
  await logActivity({ category: "AUTH", userId: user.id, message: "Signed in" });
  return ok({ ok: true });
});
