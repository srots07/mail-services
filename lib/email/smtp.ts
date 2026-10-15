import "server-only";
import nodemailer from "nodemailer";
import { decryptSecret } from "@/lib/crypto/tokens";
import { db } from "@/lib/database/prisma";
import type { EmailAccount } from "@/lib/generated/prisma/client";
import { ProviderError, type EmailProvider, type OutgoingEmail, type ProviderAccount, type SendResult } from "./provider";

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  username: string;
}

export class SmtpEmailProvider implements EmailProvider {
  readonly type = "SMTP" as const;
  private account: EmailAccount;

  constructor(account: EmailAccount) {
    this.account = account;
  }

  private getTransport() {
    let options: SmtpOptions = {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      username: this.account.email,
    };
    if (this.account.scope) {
      try {
        const parsed = JSON.parse(this.account.scope);
        options = { ...options, ...parsed };
      } catch {
        // use default fallback options
      }
    }
    const password = this.account.accessTokenEnc ? decryptSecret(this.account.accessTokenEnc) : "";

    return nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: {
        user: options.username || this.account.email,
        pass: password,
      },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }

  async sendEmail(message: OutgoingEmail): Promise<SendResult> {
    return this.send(message);
  }

  async sendTestEmail(message: OutgoingEmail): Promise<SendResult> {
    return this.send(message);
  }

  private async send(message: OutgoingEmail): Promise<SendResult> {
    const transporter = this.getTransport();
    try {
      const fromDisplay = message.from.name
        ? `"${message.from.name}" <${message.from.email || this.account.email}>`
        : message.from.email || this.account.email;

      const info = await transporter.sendMail({
        from: fromDisplay,
        to: message.to,
        cc: message.cc && message.cc.length > 0 ? message.cc : undefined,
        subject: message.subject,
        text: message.body,
      });

      return { providerMessageId: info.messageId || `smtp-${Date.now()}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/auth|invalid login|credential|password/i.test(msg)) {
        throw new ProviderError("AUTH", `SMTP authentication failed: ${msg}`);
      }
      if (/connect|timeout|econnrefused|etimedout/i.test(msg)) {
        throw new ProviderError("TRANSIENT", `SMTP connection error: ${msg}`);
      }
      if (/recipient|mailbox unavailable|user unknown|invalid address/i.test(msg)) {
        throw new ProviderError("INVALID_RECIPIENT", `SMTP recipient rejected: ${msg}`);
      }
      throw new ProviderError("PERMANENT", `SMTP send failed: ${msg}`);
    }
  }

  async verify(): Promise<void> {
    const transporter = this.getTransport();
    try {
      await transporter.verify();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProviderError("AUTH", `SMTP verification failed: ${msg}`);
    }
  }

  async getAccount(): Promise<ProviderAccount> {
    return {
      email: this.account.email,
      displayName: this.account.displayName,
      provider: "SMTP",
    };
  }

  async disconnect(): Promise<void> {
    await db().emailAccount.delete({ where: { id: this.account.id } });
  }
}
