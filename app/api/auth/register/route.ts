import { ok, publicRoute, readJson } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/services/logs";
import { registerSchema } from "@/lib/validation/auth";

export const POST = publicRoute({ rateLimit: RATE_LIMITS.auth }, async ({ req }) => {
  if (!env().allowRegistration) {
    throw new AppError("FORBIDDEN", "New registrations are disabled on this instance.");
  }
  const input = await readJson(req, registerSchema);
  const existing = await db().user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists.");

  const user = await db().user.create({
    data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password) },
    select: { id: true, email: true },
  });
  await createSession(user.id, req.headers.get("user-agent"));
  await logActivity({ category: "AUTH", userId: user.id, message: `Account created for ${user.email}` });
  return ok({ ok: true });
});
