/**
 * Offline check of the subscription license issued by the website (Ed25519, see portal/lib/license-core.ts).
 * Format: base64url(JSON payload) + "." + base64url(signature). Only the public key ships with the app.
 */
import { createPublicKey, verify } from "node:crypto";

export interface LicensePayload {
  v: 1;
  sub: string;
  email: string;
  deviceId: string;
  kind: "trial" | "paid" | "none";
  entitledUntil: string | null;
  issuedAt: string;
  expiresAt: string;
}

export type LicenseStateName = "not_required" | "active" | "trial" | "expired" | "offline" | "invalid" | "missing";

export interface LicenseState {
  required: boolean;
  state: LicenseStateName;
  canSend: boolean;
  email: string | null;
  /** Sending allowed until (ISO) */
  until: string | null;
  /** The license must be refreshed online before (ISO) */
  refreshBy: string | null;
}

export function verifyLicenseToken(token: string, publicKeyB64: string): LicensePayload | null {
  const [body, sig, extra] = token.trim().split(".");
  if (!body || !sig || extra !== undefined || !publicKeyB64) return null;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(body, "utf8"), key, Buffer.from(sig, "base64url"))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LicensePayload;
    return payload?.v === 1 && typeof payload.expiresAt === "string" ? payload : null;
  } catch {
    return null;
  }
}

/** Turns the saved license (or its absence) into what the app may do right now. */
export function evaluateLicense(token: string | null, publicKeyB64: string, now = new Date()): LicenseState {
  const base = { required: true, email: null, until: null, refreshBy: null };
  if (!token) return { ...base, state: "missing", canSend: false };
  const payload = verifyLicenseToken(token, publicKeyB64);
  if (!payload) return { ...base, state: "invalid", canSend: false };
  const info = { required: true, email: payload.email, until: payload.entitledUntil, refreshBy: payload.expiresAt };
  if (new Date(payload.expiresAt) <= now) return { ...info, state: "offline", canSend: false };
  if (!payload.entitledUntil || new Date(payload.entitledUntil) <= now || payload.kind === "none") {
    return { ...info, state: "expired", canSend: false };
  }
  return { ...info, state: payload.kind === "trial" ? "trial" : "active", canSend: true };
}

export const LICENSE_MESSAGES: Record<LicenseStateName, string> = {
  not_required: "",
  active: "",
  trial: "",
  missing: "Connect your account to start the free trial and send emails (Account → Connect account).",
  invalid: "The saved subscription license could not be verified. Connect your account again (Account → Connect account).",
  offline: "The subscription has not been checked for 7 days. Connect to the internet so the app can refresh it, then try again.",
  expired: "Your free trial or subscription has ended. Subscribe on the website to send emails again; drafts and contacts are kept.",
};
