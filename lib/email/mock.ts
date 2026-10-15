import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/database/prisma";
import type { EmailAccount } from "@/lib/generated/prisma/client";
import { buildMimeMessage } from "./mime";
import { ProviderError, type EmailProvider, type OutgoingEmail, type ProviderAccount, type SendResult } from "./provider";

/**
 * Development-only provider. Nothing is delivered. Messages are built (to validate MIME) and
 * logged. Recipient addresses containing these markers simulate failures for testing:
 *   "fail"       -> transient error (retried, then FAILED)
 *   "bounce"     -> invalid recipient (FAILED immediately)
 *   "ratelimit"  -> provider rate limit (sending slows down)
 */
export class MockEmailProvider implements EmailProvider {
  readonly type = "MOCK" as const;
  constructor(private account: EmailAccount) {}

  private async send(message: OutgoingEmail): Promise<SendResult> {
    buildMimeMessage(message);
    await new Promise((r) => setTimeout(r, 150));
    const local = message.to.split("@")[0].toLowerCase();
    if (local.includes("bounce")) throw new ProviderError("INVALID_RECIPIENT", "Simulated: mailbox does not exist");
    if (local.includes("ratelimit")) throw new ProviderError("RATE_LIMIT", "Simulated: rate limit exceeded", { retryAfterMs: 5000 });
    if (local.includes("fail")) throw new ProviderError("TRANSIENT", "Simulated: temporary provider failure");
    console.info(`[mock-email] NOT DELIVERED (mock) to=${message.to}${message.cc?.length ? ` cc=${message.cc.join(",")}` : ""} subject="${message.subject}"`);
    return { providerMessageId: `mock-${randomUUID()}` };
  }

  sendEmail(message: OutgoingEmail) {
    return this.send(message);
  }

  sendTestEmail(message: OutgoingEmail) {
    return this.send(message);
  }

  async getAccount(): Promise<ProviderAccount> {
    return { email: this.account.email, displayName: this.account.displayName, provider: "MOCK" };
  }

  async verify(): Promise<void> {}

  async disconnect(): Promise<void> {
    await db().emailAccount.delete({ where: { id: this.account.id } });
  }
}
