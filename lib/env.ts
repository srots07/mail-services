import "server-only";
import { z } from "zod";

const intFromEnv = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") return fallback;
      const parsed = Number(v);
      if (Number.isNaN(parsed)) return fallback;
      return Math.min(Math.max(Math.round(parsed), min), max);
    });

const enumFromEnv = <T extends readonly string[]>(allowed: T, fallback: T[number]) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const val = v?.trim().toLowerCase();
      return (val && (allowed as readonly string[]).includes(val) ? val : fallback) as T[number];
    });

const schema = z.object({
  NODE_ENV: enumFromEnv(["development", "test", "production"] as const, "development"),
  DATABASE_URL: z.string().default(""),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  APP_URL: z.string().default("http://localhost:3000"),
  SESSION_SECRET: z.string().default(""),
  TOKEN_ENCRYPTION_KEY: z.string().default(""),
  ALLOW_REGISTRATION: z.string().default("true"),
  AUTO_LOGIN: z.string().default("false"),
  AUTO_LOGIN_EMAIL: z.string().trim().toLowerCase().default("owner@localhost"),
  ADMIN_EMAIL: z.string().trim().toLowerCase().default(""),

  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o-mini"),
  GROQ_API_KEY: z.string().default(""),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  AI_CONCURRENCY: intFromEnv(3, 1, 10),
  AI_MAX_RETRIES: intFromEnv(4, 0, 10),
  AI_TIMEOUT_MS: intFromEnv(45000, 5000, 180000),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default(""),

  EMAIL_BATCH_SIZE: intFromEnv(10, 1, 100),
  EMAIL_BATCH_DELAY_MS: intFromEnv(60000, 1000, 3600000),
  MAX_EMAIL_RETRIES: intFromEnv(3, 0, 10),

  AI_PROVIDER: enumFromEnv(["openrouter", "groq", "mock"] as const, "openrouter"),
  EMAIL_PROVIDER: enumFromEnv(["gmail", "mock", "smtp"] as const, "gmail"),

  /** Set only by the Electron shell: the server runs on this PC for one local owner. */
  DESKTOP_MODE: z.string().default("false"),
  /** Random per launch; required by desktop auto-login so other local programs cannot sign in. */
  DESKTOP_TOKEN: z.string().default(""),

  /** Direct UPI Payment settings (No gateway required) */
  UPI_ID: z.string().default("owner@upi"),
  UPI_NAME: z.string().default("Sorts Engine"),
  UPI_AMOUNT_INR: intFromEnv(85, 1, 100000),
  CREDITS_PER_PAYMENT: intFromEnv(5, 1, 1000),
  FREE_TRIAL_CREDITS: intFromEnv(5, 0, 1000),

  /** Subscription license (set by the desktop shell): signed license file, its public key, and the website. */
  LICENSE_FILE: z.string().default(""),
  LICENSE_PUBLIC_KEY: z.string().default(""),
  LICENSE_REQUIRED: z.string().default("false"),
  PORTAL_URL: z.string().default(""),
});

export type ServerEnv = z.infer<typeof schema> & {
  isProduction: boolean;
  aiProvider: "openrouter" | "groq" | "mock";
  emailProvider: "gmail" | "mock" | "smtp";
  allowRegistration: boolean;
  autoLogin: boolean;
  desktopMode: boolean;
  /** Sending needs a valid subscription license. */
  licenseRequired: boolean;
};

let cached: ServerEnv | null = null;

export function invalidateEnvCache(): void {
  cached = null;
}

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    console.error(`[env] Invalid environment configuration: ${fields}`);
  }
  const e = parsed.success ? parsed.data : schema.parse({});
  const isProduction = e.NODE_ENV === "production";
  const desktopMode = e.DESKTOP_MODE.toLowerCase() === "true" && e.DESKTOP_TOKEN.length >= 32;
  let dbUrl = e.DATABASE_URL.trim();
  if ((dbUrl.startsWith('"') && dbUrl.endsWith('"')) || (dbUrl.startsWith("'") && dbUrl.endsWith("'"))) {
    dbUrl = dbUrl.slice(1, -1).trim();
  }
  if (dbUrl.startsWith("DATABASE_URL=")) {
    dbUrl = dbUrl.slice("DATABASE_URL=".length).trim();
  }
  const FALLBACK_DB_URL = "postgresql://postgres.jnbkujuekofcabqzdksk:UAdMSkZhHjlOhw2m@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require";
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    dbUrl = FALLBACK_DB_URL;
  }
  const appUrl = (e.APP_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || "https://srots-mail.netlify.app").replace(/\/+$/, "");
  cached = {
    ...e,
    DATABASE_URL: dbUrl,
    APP_URL: appUrl,
    isProduction,
    // Mock providers are never allowed in production builds.
    aiProvider: isProduction ? (e.AI_PROVIDER === "mock" ? "openrouter" : e.AI_PROVIDER) : e.AI_PROVIDER,
    emailProvider: isProduction ? (e.EMAIL_PROVIDER === "mock" ? "gmail" : e.EMAIL_PROVIDER) : e.EMAIL_PROVIDER,
    allowRegistration: !desktopMode && e.ALLOW_REGISTRATION.toLowerCase() !== "false",
    // Skipping sign-in is a local single-user convenience: dev builds, or the token-guarded desktop app.
    autoLogin: desktopMode || (!isProduction && e.AUTO_LOGIN.toLowerCase() === "true"),
    desktopMode,
    licenseRequired: (desktopMode && e.LICENSE_PUBLIC_KEY.length > 0) || e.LICENSE_REQUIRED.toLowerCase() === "true",
    PORTAL_URL: e.PORTAL_URL.replace(/\/+$/, ""),
  };
  return cached;
}

export interface ConfigCheck {
  key: string;
  label: string;
  ok: boolean;
  hint: string;
  /** Optional integrations are listed but never count as missing setup. */
  optional?: boolean;
}

/** Non-secret summary of configuration state for the setup screen. */
export function configChecks(): ConfigCheck[] {
  const e = env();
  const keyBytes = (() => {
    try {
      return Buffer.from(e.TOKEN_ENCRYPTION_KEY, "base64").length;
    } catch {
      return 0;
    }
  })();
  return [
    { key: "DATABASE_URL", label: "Database", ok: e.DATABASE_URL.length > 0, hint: "PostgreSQL connection string" },
    { key: "SESSION_SECRET", label: "Session secret", ok: e.SESSION_SECRET.length >= 32, hint: "At least 32 random characters" },
    { key: "TOKEN_ENCRYPTION_KEY", label: "Token encryption key", ok: keyBytes === 32, hint: "Base64 encoded 32-byte key" },
    {
      key: "OPENROUTER_API_KEY",
      label: "OpenRouter API key",
      ok: e.aiProvider === "mock" || e.OPENROUTER_API_KEY.length > 0 || e.GROQ_API_KEY.length > 0,
      hint: e.aiProvider === "mock" ? "Using development mock AI provider" : e.GROQ_API_KEY ? "Using Groq fallback" : "Required for AI generation",
    },
    { key: "OPENROUTER_MODEL", label: "OpenRouter model", ok: e.OPENROUTER_MODEL.length > 0, hint: e.OPENROUTER_MODEL },
    {
      key: "GROQ_API_KEY",
      label: "Groq API key (fallback / primary)",
      ok: e.GROQ_API_KEY.length > 0,
      hint: e.GROQ_API_KEY.length > 0 ? `Active: model ${e.GROQ_MODEL}` : "Fallback for when OpenRouter is out of credits",
      optional: true,
    },
    {
      key: "GOOGLE_OAUTH",
      label: "Google OAuth client",
      ok: e.emailProvider === "mock" || (e.GOOGLE_CLIENT_ID.length > 0 && e.GOOGLE_CLIENT_SECRET.length > 0 && e.GOOGLE_REDIRECT_URI.length > 0),
      hint: e.emailProvider === "mock" ? "Using development mock email provider" : "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI",
    },
  ];
}
