export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CSRF"
  | "INVALID_STATE"
  | "NOT_CONFIGURED"
  | "PROVIDER_AUTH"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_ERROR"
  | "DUPLICATE_SEND"
  | "DATABASE"
  | "DATABASE_SCHEMA"
  | "CONFIG_ERROR"
  | "PAYMENT_REQUIRED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  CSRF: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE_SEND: 409,
  INVALID_STATE: 409,
  RATE_LIMITED: 429,
  PROVIDER_RATE_LIMIT: 429,
  NOT_CONFIGURED: 503,
  PROVIDER_AUTH: 502,
  PROVIDER_ERROR: 502,
  DATABASE: 503,
  DATABASE_SCHEMA: 503,
  CONFIG_ERROR: 503,
  INTERNAL: 500,
};

/** Error whose message is safe and understandable to show to end users. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
