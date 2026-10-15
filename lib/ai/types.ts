import type { GeneratedEmailContent } from "./schema";
import type { BuiltPrompt } from "./prompt";

export type AiErrorKind = "RATE_LIMIT" | "TIMEOUT" | "SERVER" | "NETWORK" | "MALFORMED" | "AUTH" | "BAD_REQUEST" | "CREDITS" | "NOT_CONFIGURED";

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;

  constructor(kind: AiErrorKind, message: string, opts: { httpStatus?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.httpStatus = opts.httpStatus;
    this.retryAfterMs = opts.retryAfterMs;
  }

  get retryable(): boolean {
    return this.kind === "RATE_LIMIT" || this.kind === "TIMEOUT" || this.kind === "SERVER" || this.kind === "NETWORK" || this.kind === "MALFORMED";
  }
}

export interface AiAttemptResult {
  content: GeneratedEmailContent;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

export interface AiProvider {
  readonly name: string;
  model(): string;
  /** Performs a single attempt. Retries are orchestrated by the generation queue. */
  generate(prompt: BuiltPrompt, opts: GenerateOptions): Promise<AiAttemptResult>;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  strictJsonReminder?: boolean;
  /** Problems found in the previous attempt's output, sent back so the model can correct them. */
  correction?: string;
}

/** Friendly message for end users. */
export function describeAiError(err: AiError): string {
  switch (err.kind) {
    case "RATE_LIMIT":
      return "OpenRouter rate limit reached. Generation will slow down and retry automatically.";
    case "TIMEOUT":
      return "The AI model took too long to respond.";
    case "SERVER":
      return "The AI provider had a temporary problem.";
    case "NETWORK":
      return "Could not reach OpenRouter (network error).";
    case "MALFORMED":
      return "The AI returned an invalid response that could not be used.";
    case "AUTH":
      return "OpenRouter rejected the API key. Check OPENROUTER_API_KEY.";
    case "CREDITS":
      return "Your OpenRouter account has insufficient credits.";
    case "BAD_REQUEST":
      return `OpenRouter rejected the request: ${err.message}`;
    case "NOT_CONFIGURED":
      return "OpenRouter is not configured. Set OPENROUTER_API_KEY in the server environment.";
  }
}
