import "server-only";
import { readFileSync, statSync } from "node:fs";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { LICENSE_MESSAGES, evaluateLicense, type LicenseState } from "@/lib/license-verify";

let cache: { mtimeMs: number; token: string | null } | null = null;

/** license.json is rewritten by the desktop shell; re-read only when it changes. */
function readToken(file: string): string | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    cache = null;
    return null;
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.token;
  let token: string | null = null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { license?: unknown };
    token = typeof parsed.license === "string" ? parsed.license : null;
  } catch {
    token = null;
  }
  cache = { mtimeMs, token };
  return token;
}

export function licenseState(now = new Date()): LicenseState {
  const e = env();
  if (!e.licenseRequired) return { required: false, state: "not_required", canSend: true, email: null, until: null, refreshBy: null };
  const token = e.LICENSE_FILE ? readToken(e.LICENSE_FILE) : null;
  return evaluateLicense(token, e.LICENSE_PUBLIC_KEY, now);
}

/** Every path that sends (or schedules sending) calls this first. */
export function assertCanSend(): void {
  const state = licenseState();
  if (!state.canSend) throw new AppError("PAYMENT_REQUIRED", LICENSE_MESSAGES[state.state], { license: state.state });
}
