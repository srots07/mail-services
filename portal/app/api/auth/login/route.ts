import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, sameOrigin } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { HttpError, clientIp, handle, json, rateLimit, readJson } from "@/lib/api";

const body = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = handle(async (request: Request) => {
  if (!sameOrigin(request)) throw new HttpError(403, "Cross-site request blocked.");
  const input = body.parse(await readJson(request));
  rateLimit(`login:${clientIp(request)}`, 20, 60_000);
  rateLimit(`login:${input.email}`, 10, 60_000);
  const user = await db().user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, "Wrong email or password.");
  }
  await createSession(user.id);
  return json({ ok: true });
});
