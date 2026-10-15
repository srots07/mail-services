import "server-only";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { EmailAccount } from "@/lib/generated/prisma/client";
import { GmailProvider } from "./gmail";
import { MockEmailProvider } from "./mock";
import { SmtpEmailProvider } from "./smtp";
import type { EmailProvider } from "./provider";

export function providerForAccount(account: EmailAccount): EmailProvider {
  switch (account.provider) {
    case "GMAIL":
      return new GmailProvider(account);
    case "SMTP":
      return new SmtpEmailProvider(account);
    case "MOCK":
      if (env().isProduction) throw new AppError("NOT_CONFIGURED", "Mock email provider is disabled in production.");
      return new MockEmailProvider(account);
    case "MICROSOFT":
      throw new AppError("NOT_CONFIGURED", "Microsoft Graph sending is not implemented yet.");
  }
}

export function publicAccount(a: EmailAccount | null) {
  if (!a) return null;
  return { id: a.id, provider: a.provider, email: a.email, displayName: a.displayName, connectedAt: a.createdAt.toISOString() };
}
