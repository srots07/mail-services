import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createSession, sameOrigin } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { HttpError, clientIp, handle, json, rateLimit, readJson } from "@/lib/api";

const body = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for the password.").max(200),
});

export const POST = handle(async (request: Request) => {
  if (!sameOrigin(request)) throw new HttpError(403, "Cross-site request blocked.");
  rateLimit(`signup:${clientIp(request)}`, 10, 60_000);
  const input = body.parse(await readJson(request));
  const existing = await db().user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, "An account with this email already exists. Log in instead.");
  const trialEndsAt = new Date(Date.now() + env().TRIAL_DAYS * 86_400_000);
  const user = await db().user.create({
    data: {
      email: input.email,
      name: input.name || null,
      passwordHash: await hashPassword(input.password),
      subscription: { create: { status: "TRIAL", trialEndsAt } },
    },
  });
  await createSession(user.id);
  return json({ ok: true });
});
