import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { db } from "@/lib/database/prisma";
import type { EmailAccount } from "@/lib/generated/prisma/client";
import { parseRetryAfter } from "@/lib/queue/backoff";
import { refreshAccessToken, revokeToken } from "./google-oauth";
import { buildMimeMessage } from "./mime";
import { ProviderError, type EmailProvider, type OutgoingEmail, type ProviderAccount, type SendResult } from "./provider";

const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export class GmailProvider implements EmailProvider {
  readonly type = "GMAIL" as const;
  private account: EmailAccount;

  constructor(account: EmailAccount) {
    this.account = account;
  }

  private async accessToken(forceRefresh = false): Promise<string> {
    const a = this.account;
    const valid = a.accessTokenEnc && a.tokenExpiresAt && a.tokenExpiresAt.getTime() - Date.now() > 60_000;
    if (valid && !forceRefresh) return decryptSecret(a.accessTokenEnc!);
    if (!a.refreshTokenEnc) throw new ProviderError("AUTH", "No refresh token stored. Reconnect your Gmail account.");

    const tokens = await refreshAccessToken(decryptSecret(a.refreshTokenEnc));
    this.account = await db().emailAccount.update({
      where: { id: a.id },
      data: {
        accessTokenEnc: encryptSecret(tokens.access_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) } : {}),
      },
    });
    return tokens.access_token;
  }

  private async send(message: OutgoingEmail, retriedAuth = false): Promise<SendResult> {
    let raw: string;
    try {
      raw = Buffer.from(buildMimeMessage(message), "utf8").toString("base64url");
    } catch (err) {
      throw new ProviderError("INVALID_RECIPIENT", err instanceof Error ? err.message : "Invalid message");
    }
    const token = await this.accessToken(retriedAuth);
    let res: Response;
    try {
      res = await fetch(SEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const timeout = err instanceof Error && err.name === "TimeoutError";
      throw new ProviderError("TRANSIENT", timeout ? "Gmail request timed out" : "Network error contacting Gmail");
    }

    if (res.ok) {
      const data = (await res.json()) as { id?: string };
      return { providerMessageId: data.id ?? "unknown" };
    }

    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
    const msg = data.error?.message?.slice(0, 300) ?? `Gmail returned ${res.status}`;
    const reason = data.error?.errors?.[0]?.reason ?? "";
    if (res.status === 401 && !retriedAuth) return this.send(message, true);
    if (res.status === 401) throw new ProviderError("AUTH", msg, { httpStatus: 401 });
    if (res.status === 429 || /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded/i.test(reason)) {
      throw new ProviderError("RATE_LIMIT", msg, { httpStatus: res.status, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) ?? undefined });
    }
    if (res.status === 403) {
      if (/insufficientPermissions|forbidden|authError/i.test(reason) || /scope|permission/i.test(msg)) {
        throw new ProviderError("AUTH", msg, { httpStatus: 403 });
      }
      throw new ProviderError("RATE_LIMIT", msg, { httpStatus: 403 });
    }
    if (res.status >= 500) throw new ProviderError("TRANSIENT", msg, { httpStatus: res.status });
    if (res.status === 400 && /recipient|address|invalid to/i.test(msg)) throw new ProviderError("INVALID_RECIPIENT", msg, { httpStatus: 400 });
    throw new ProviderError("PERMANENT", msg, { httpStatus: res.status });
  }

  sendEmail(message: OutgoingEmail): Promise<SendResult> {
    return this.send(message);
  }

  sendTestEmail(message: OutgoingEmail): Promise<SendResult> {
    return this.send(message);
  }

  /** Confirms the stored grant still works by obtaining a valid access token. */
  async verify(): Promise<void> {
    await this.accessToken();
  }

  async getAccount(): Promise<ProviderAccount> {
    return { email: this.account.email, displayName: this.account.displayName, provider: "GMAIL" };
  }

  async disconnect(): Promise<void> {
    const token = this.account.refreshTokenEnc ?? this.account.accessTokenEnc;
    if (token) {
      try {
        await revokeToken(decryptSecret(token));
      } catch {
        // Revocation is best effort.
      }
    }
    await db().emailAccount.delete({ where: { id: this.account.id } });
  }
}
