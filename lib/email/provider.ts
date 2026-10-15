export interface OutgoingEmail {
  from: { email: string; name?: string | null };
  to: string;
  /** Copied on this one email; never another recipient of the campaign. */
  cc?: string[];
  subject: string;
  /** Plain-text body; sent exactly as previewed. */
  body: string;
}

export interface SendResult {
  providerMessageId: string;
}

export interface ProviderAccount {
  email: string;
  displayName: string | null;
  provider: "GMAIL" | "MICROSOFT" | "MOCK" | "SMTP";
}

export type ProviderErrorKind = "AUTH" | "RATE_LIMIT" | "INVALID_RECIPIENT" | "TRANSIENT" | "PERMANENT";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryAfterMs?: number;
  readonly httpStatus?: number;

  constructor(kind: ProviderErrorKind, message: string, opts: { retryAfterMs?: number; httpStatus?: number } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.retryAfterMs = opts.retryAfterMs;
    this.httpStatus = opts.httpStatus;
  }
}

/**
 * OAuth-based email provider. Implementations: Gmail (lib/email/gmail.ts) and a development
 * mock. Microsoft Graph can be added by implementing this interface.
 */
export interface EmailProvider {
  readonly type: ProviderAccount["provider"];
  sendEmail(message: OutgoingEmail): Promise<SendResult>;
  sendTestEmail(message: OutgoingEmail): Promise<SendResult>;
  getAccount(): Promise<ProviderAccount>;
  verify(): Promise<void>;
  disconnect(): Promise<void>;
}

export function describeProviderError(err: ProviderError): string {
  switch (err.kind) {
    case "AUTH":
      return "Your email account authorization expired or was revoked. Reconnect it in Settings.";
    case "RATE_LIMIT":
      return "The email provider is rate limiting requests. Sending has been slowed down.";
    case "INVALID_RECIPIENT":
      return `The recipient address was rejected: ${err.message}`;
    case "TRANSIENT":
      return `Temporary email provider error: ${err.message}`;
    case "PERMANENT":
      return `The email provider rejected the message: ${err.message}`;
  }
}
