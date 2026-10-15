import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { ProviderError } from "./provider";

export const GOOGLE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"];

export function assertGoogleConfigured() {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET || !e.GOOGLE_REDIRECT_URI) {
    throw new AppError("NOT_CONFIGURED", "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.");
  }
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthUrl(state: string, codeVerifier: string): string {
  const e = env();
  const params = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: e.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state,
    code_challenge: pkceChallenge(codeVerifier),
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderError("TRANSIENT", "Could not reach Google to refresh authorization");
  }
  const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant" || res.status === 400 || res.status === 401) {
      throw new ProviderError("AUTH", data.error_description ?? data.error ?? "Google authorization failed", { httpStatus: res.status });
    }
    throw new ProviderError("TRANSIENT", data.error_description ?? `Google token endpoint returned ${res.status}`, { httpStatus: res.status });
  }
  return data as TokenResponse;
}

export function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const e = env();
  return tokenRequest({
    code,
    client_id: e.GOOGLE_CLIENT_ID,
    client_secret: e.GOOGLE_CLIENT_SECRET,
    redirect_uri: e.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const e = env();
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: e.GOOGLE_CLIENT_ID,
    client_secret: e.GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
}

export async function fetchGoogleUser(accessToken: string): Promise<{ email: string; name: string | null }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new ProviderError("AUTH", `Could not read Google account profile (${res.status})`);
  const data = (await res.json()) as { email?: string; name?: string; email_verified?: boolean };
  if (!data.email) throw new ProviderError("AUTH", "Google account has no email address");
  return { email: data.email.toLowerCase(), name: data.name ?? null };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best effort; the local credentials are deleted regardless.
  }
}
