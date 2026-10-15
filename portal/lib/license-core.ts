/**
 * Signed desktop licenses. Format: base64url(JSON payload) + "." + base64url(Ed25519 signature).
 * The desktop app only holds the public key, so it can check a license offline but never mint one.
 */
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export interface LicensePayload {
  v: 1;
  /** Portal user id */
  sub: string;
  email: string;
  deviceId: string;
  /** "trial" | "paid" | "none" */
  kind: "trial" | "paid" | "none";
  /** Sending allowed until this instant (ISO), or null when not entitled */
  entitledUntil: string | null;
  issuedAt: string;
  /** The license itself must be refreshed before this instant (offline window) */
  expiresAt: string;
}

export const OFFLINE_DAYS = 7;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function signLicense(payload: LicensePayload, privateKeyB64: string): string {
  const key = createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(null, Buffer.from(body, "utf8"), key);
  return `${body}.${b64url(sig)}`;
}

export function verifyLicense(token: string, publicKeyB64: string): LicensePayload | null {
  const [body, sig, extra] = token.trim().split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(body, "utf8"), key, Buffer.from(sig, "base64url"))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LicensePayload;
    return payload && payload.v === 1 ? payload : null;
  } catch {
    return null;
  }
}

export function publicKeyFromPrivate(privateKeyB64: string): string {
  const key = createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  return createPublicKey(key).export({ format: "der", type: "spki" }).toString("base64");
}

export function buildPayload(input: {
  userId: string;
  email: string;
  deviceId: string;
  kind: LicensePayload["kind"];
  entitledUntil: Date | null;
  now?: Date;
}): LicensePayload {
  const now = input.now ?? new Date();
  return {
    v: 1,
    sub: input.userId,
    email: input.email,
    deviceId: input.deviceId,
    kind: input.kind,
    entitledUntil: input.entitledUntil ? input.entitledUntil.toISOString() : null,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OFFLINE_DAYS * 86_400_000).toISOString(),
  };
}
