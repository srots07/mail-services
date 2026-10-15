import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { encryptSecret } from "@/lib/crypto/tokens";
import { db } from "@/lib/database/prisma";
import { publicAccount } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/services/logs";
import nodemailer from "nodemailer";
import { z } from "zod";

const smtpInputSchema = z.object({
  fromEmail: z.string().email("A valid sending email address is required"),
  fromName: z.string().optional().default(""),
  host: z.string().min(1, "SMTP host is required").default("smtp.gmail.com"),
  port: z.number().int().min(1).max(65535).default(465),
  secure: z.boolean().default(true),
  username: z.string().optional(),
  password: z.string().min(1, "SMTP password or App Password is required"),
  setAsActive: z.boolean().optional().default(true),
});

export const GET = authedRoute({}, async ({ user }) => {
  const account = await db().emailAccount.findFirst({ where: { userId: user.id, provider: "SMTP" } });
  if (!account) return ok({ configured: false, smtp: null });
  let details = { host: "smtp.gmail.com", port: 465, secure: true, username: account.email };
  if (account.scope) {
    try {
      details = { ...details, ...JSON.parse(account.scope) };
    } catch {
      // ignore parsing error
    }
  }
  return ok({
    configured: true,
    smtp: {
      email: account.email,
      displayName: account.displayName,
      host: details.host,
      port: details.port,
      secure: details.secure,
      username: details.username,
      connectedAt: account.createdAt.toISOString(),
    },
  });
});

export const POST = authedRoute({}, async ({ req, user }) => {
  const body = await readJson(req, smtpInputSchema);
  const username = (body.username || body.fromEmail).trim();
  const password = body.password.trim();

  // Test the SMTP connection and authentication
  const transporter = nodemailer.createTransport({
    host: body.host.trim(),
    port: body.port,
    secure: body.secure,
    auth: {
      user: username,
      pass: password,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  try {
    await transporter.verify();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError("INVALID_STATE", `SMTP connection test failed: ${msg}`);
  }

  const accessTokenEnc = encryptSecret(password);
  const scope = JSON.stringify({
    host: body.host.trim(),
    port: body.port,
    secure: body.secure,
    username,
  });

  const account = await db().emailAccount.upsert({
    where: { userId_provider: { userId: user.id, provider: "SMTP" } },
    create: {
      userId: user.id,
      provider: "SMTP",
      email: body.fromEmail.trim(),
      displayName: body.fromName?.trim() || null,
      accessTokenEnc,
      scope,
    },
    update: {
      email: body.fromEmail.trim(),
      displayName: body.fromName?.trim() || null,
      accessTokenEnc,
      scope,
    },
  });

  if (body.setAsActive) {
    await db().user.update({
      where: { id: user.id },
      data: { emailProvider: "SMTP" },
    });
  }

  await logActivity({
    category: "AUTH",
    userId: user.id,
    message: `Direct SMTP sending mail configured: ${body.fromEmail.trim()} via ${body.host.trim()}:${body.port}`,
  });

  return ok({ ok: true, account: publicAccount(account) });
});
