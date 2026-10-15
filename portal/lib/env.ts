import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default(""),
  APP_URL: z.string().default("http://localhost:3100"),
  SESSION_SECRET: z.string().default(""),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  RAZORPAY_PLAN_MONTHLY: z.string().default(""),
  RAZORPAY_PLAN_YEARLY: z.string().default(""),
  PRICE_MONTHLY_LABEL: z.string().default("₹999 / month"),
  PRICE_YEARLY_LABEL: z.string().default("₹9,999 / year"),
  LICENSE_SIGNING_KEY: z.string().default(""),
  TRIAL_DAYS: z.coerce.number().int().min(0).max(90).default(7),
  MAX_DEVICES: z.coerce.number().int().min(1).max(20).default(2),
  DOWNLOAD_URL: z.string().default(""),
  /** Folder with latest.json and the installers served at /updates (default: ./updates). */
  UPDATES_DIR: z.string().default(""),
});

export type PortalEnv = z.infer<typeof schema> & {
  isProduction: boolean;
  /** Razorpay keys missing outside production: checkout is simulated so the flow can be tested locally. */
  razorpayMock: boolean;
};

let cached: PortalEnv | null = null;

export function env(): PortalEnv {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  const isProduction = parsed.NODE_ENV === "production";
  const razorpayMock = !isProduction && (!parsed.RAZORPAY_KEY_ID || !parsed.RAZORPAY_KEY_SECRET);
  if (isProduction) {
    const missing = (
      ["DATABASE_URL", "SESSION_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "LICENSE_SIGNING_KEY"] as const
    ).filter((k) => !parsed[k]);
    if (missing.length) throw new Error(`Missing required settings: ${missing.join(", ")}`);
    if (parsed.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  }
  cached = { ...parsed, APP_URL: parsed.APP_URL.replace(/\/+$/, ""), isProduction, razorpayMock };
  return cached;
}
