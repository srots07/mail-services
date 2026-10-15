import "server-only";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { AppError, errorMessage } from "@/lib/errors";
import type { EmailAccount } from "@/lib/generated/prisma/client";
import { providerForAccount } from "@/lib/email";
import { ProviderError, describeProviderError } from "@/lib/email/provider";

export type AiChoice = "openrouter" | "groq" | "mock";
export type EmailChoice = "gmail" | "mock" | "smtp";
export type ResearchChoice = "live" | "mock";

export interface ProviderSettings {
  ai: AiChoice;
  email: EmailChoice;
  research: ResearchChoice;
  /** "user" = chosen in Settings, "env" = server default (AI_PROVIDER / EMAIL_PROVIDER). */
  aiSource: "user" | "env" | "production";
  emailSource: "user" | "env" | "production";
  mockAllowed: boolean;
}

/** The providers this user's campaigns use. Production always uses the real providers. */
export async function getProviderSettings(userId: string): Promise<ProviderSettings> {
  const e = env();
  const user = await db().user.findUnique({ where: { id: userId }, select: { aiProvider: true, emailProvider: true, researchProvider: true } });
  const emailResolved: EmailChoice = user?.emailProvider === "SMTP" ? "smtp" : user?.emailProvider === "MOCK" && !e.isProduction ? "mock" : user?.emailProvider === "GMAIL" ? "gmail" : (e.emailProvider as EmailChoice) || "gmail";
  if (e.isProduction) return { ai: e.aiProvider === "mock" ? "openrouter" : e.aiProvider, email: emailResolved === "mock" ? "gmail" : emailResolved, research: "live", aiSource: "production", emailSource: "production", mockAllowed: false };
  return {
    ai: user?.aiProvider ? (user.aiProvider === "MOCK" ? "mock" : "openrouter") : e.aiProvider,
    email: emailResolved,
    research: user?.researchProvider === "MOCK" ? "mock" : "live",
    aiSource: user?.aiProvider ? "user" : "env",
    emailSource: user?.emailProvider ? "user" : "env",
    mockAllowed: true,
  };
}

export async function setProviderSettings(userId: string, input: { ai?: AiChoice; email?: EmailChoice; research?: ResearchChoice }): Promise<ProviderSettings> {
  if (env().isProduction && (input.ai === "mock" || input.email === "mock" || input.research === "mock")) {
    throw new AppError("FORBIDDEN", "Mock providers are disabled in production.");
  }
  if (input.email) {
    const active = await db().campaign.count({ where: { userId, status: { in: ["RUNNING", "SCHEDULED"] } } });
    if (active > 0) throw new AppError("INVALID_STATE", "Pause scheduled or running campaigns before changing the email provider.");
  }
  await db().user.update({
    where: { id: userId },
    data: {
      ...(input.ai ? { aiProvider: input.ai === "mock" ? "MOCK" : "OPENROUTER" } : {}),
      ...(input.email ? { emailProvider: input.email === "mock" ? "MOCK" : input.email === "smtp" ? "SMTP" : "GMAIL" } : {}),
      ...(input.research ? { researchProvider: input.research === "mock" ? "MOCK" : "LIVE" } : {}),
    },
  });
  return getProviderSettings(userId);
}

export interface ProviderHealth {
  provider: AiChoice | EmailChoice;
  label: string;
  connected: boolean;
  detail: string;
}

export interface ProviderStatus {
  ai: ProviderHealth;
  email: ProviderHealth & { account: { email: string; provider: string } | null };
  mode: "REAL" | "MOCK" | "MIXED";
}

const KEY_CHECK_TTL_MS = 5 * 60_000;
const g = globalThis as unknown as { __openRouterKeyCheck?: { at: number; ok: boolean; detail: string } };

/** Checks the OpenRouter key against the key endpoint (cached). Never returns key material. */
async function checkOpenRouter(force: boolean): Promise<{ ok: boolean; detail: string }> {
  const e = env();
  if (!e.OPENROUTER_API_KEY) return { ok: false, detail: "OPENROUTER_API_KEY is not set on the server" };
  const cached = g.__openRouterKeyCheck;
  if (!force && cached && Date.now() - cached.at < KEY_CHECK_TTL_MS) return cached;
  let result: { ok: boolean; detail: string };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${e.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) result = { ok: true, detail: `Model ${e.OPENROUTER_MODEL}` };
    else if (res.status === 401 || res.status === 403) result = { ok: false, detail: "OpenRouter rejected the API key" };
    else result = { ok: false, detail: `OpenRouter key check returned HTTP ${res.status}` };
  } catch {
    result = { ok: false, detail: "Could not reach OpenRouter" };
  }
  g.__openRouterKeyCheck = { at: Date.now(), ...result };
  return result;
}

/** The sender account matching the user's selected email provider. */
export async function getActiveEmailAccount(userId: string, choice?: EmailChoice): Promise<EmailAccount | null> {
  const email = choice ?? (await getProviderSettings(userId)).email;
  const provider = email === "mock" ? "MOCK" : email === "smtp" ? "SMTP" : "GMAIL";
  return db().emailAccount.findFirst({ where: { userId, provider } });
}

/** Scheduled or sending campaigns would silently change sender, so switching or disconnecting waits for them. */
export async function senderChangeBlocker(userId: string, accountId: string): Promise<string | null> {
  const active = await db().campaign.count({ where: { userId, senderAccountId: accountId, status: { in: ["RUNNING", "SCHEDULED"] } } });
  return active > 0 ? "Pause or cancel scheduled and running campaigns before switching or disconnecting the sender account." : null;
}

export async function getProviderStatus(userId: string, opts: { force?: boolean } = {}): Promise<ProviderStatus> {
  const settings = await getProviderSettings(userId);
  const e = env();

  let ai: ProviderHealth;
  if (settings.ai === "mock") {
    ai = { provider: "mock", label: "Mock AI", connected: true, detail: "Development templates - not real AI" };
  } else if (settings.ai === "groq") {
    ai = { provider: "groq", label: "Groq", connected: e.GROQ_API_KEY.length > 0, detail: e.GROQ_API_KEY ? `Model ${e.GROQ_MODEL}` : "GROQ_API_KEY is not set" };
  } else {
    const check = await checkOpenRouter(!!opts.force);
    if (!check.ok && e.GROQ_API_KEY) {
      ai = { provider: "openrouter", label: "OpenRouter (Groq fallback active)", connected: true, detail: `Groq fallback active: ${e.GROQ_MODEL}` };
    } else {
      ai = { provider: "openrouter", label: "OpenRouter", connected: check.ok, detail: check.detail };
    }
  }

  const account = await getActiveEmailAccount(userId, settings.email);
  let email: ProviderStatus["email"];
  if (settings.email === "mock") {
    email = {
      provider: "mock",
      label: "Mock email",
      connected: !!account,
      detail: account ? "Nothing is delivered" : "Connect the mock sender in Settings",
      account: account ? { email: account.email, provider: account.provider } : null,
    };
  } else if (settings.email === "smtp") {
    if (!account) {
      email = { provider: "mock", label: "Direct SMTP", connected: false, detail: "No SMTP sending mail configured", account: null };
    } else {
      let connected = true;
      let detail = `Sending as ${account.email}`;
      try {
        await providerForAccount(account).verify();
      } catch (err) {
        connected = false;
        detail = err instanceof ProviderError ? describeProviderError(err) : `SMTP check failed: ${errorMessage(err)}`;
      }
      email = { provider: "gmail", label: "Direct SMTP", connected, detail, account: { email: account.email, provider: account.provider } };
    }
  } else if (!account) {
    email = { provider: "gmail", label: "Gmail", connected: false, detail: "No Gmail account connected", account: null };
  } else {
    let connected = true;
    let detail = `Sending as ${account.email}`;
    try {
      await providerForAccount(account).verify();
    } catch (err) {
      connected = false;
      detail = err instanceof ProviderError ? describeProviderError(err) : `Gmail check failed: ${errorMessage(err)}`;
    }
    email = { provider: "gmail", label: "Gmail", connected, detail, account: { email: account.email, provider: account.provider } };
  }

  const realAi = settings.ai !== "mock";
  const realEmail = settings.email !== "mock";
  return { ai, email, mode: realAi && realEmail ? "REAL" : !realAi && !realEmail ? "MOCK" : "MIXED" };
}
