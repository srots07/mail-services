import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { db } from "@/lib/database/prisma";
import { assertGoogleConfigured, exchangeCode, fetchGoogleUser, GOOGLE_SCOPES, revokeToken } from "@/lib/email/google-oauth";
import { ProviderError } from "@/lib/email/provider";
import { env } from "@/lib/env";
import { AppError, errorMessage } from "@/lib/errors";
import { logActivity } from "@/lib/services/logs";
import { senderChangeBlocker } from "@/lib/services/providers";

const OAUTH_COOKIE = "ecm_oauth";

const RETURN_PATHS = new Set(["/settings"]);

function returnPath(raw: string | undefined): string {
  try {
    const ret = raw ? (JSON.parse(raw) as { ret?: string }).ret : undefined;
    return ret && RETURN_PATHS.has(ret) ? ret : "/settings";
  } catch {
    return "/settings";
  }
}

function settingsRedirect(params: Record<string, string>, path = "/settings") {
  // Desktop sign-in happens in the system browser; the app window refreshes itself.
  const target = env().desktopMode ? "/desktop/gmail-done" : path;
  return NextResponse.redirect(`${env().APP_URL}${target}?${new URLSearchParams(params)}`);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const store = await cookies();
  const raw = store.get(OAUTH_COOKIE)?.value;
  store.delete({ name: OAUTH_COOKIE, path: "/api/oauth/google" });

  const session = await getSession();
  if (!session) return NextResponse.redirect(`${env().APP_URL}/login`);
  const back = returnPath(raw);

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    await logActivity({ category: "AUTH", level: "WARN", userId: session.user.id, message: `Google authorization was cancelled or denied (${params.get("error")})` });
    return settingsRedirect({ oauth: "error", message: "Google authorization was cancelled." }, back);
  }

  try {
    assertGoogleConfigured();
    let saved: { state?: string; verifier?: string; uid?: string } = {};
    try {
      saved = raw ? JSON.parse(raw) : {};
    } catch {
      saved = {};
    }
    const state = params.get("state") ?? "";
    const code = params.get("code") ?? "";
    if (!saved.state || !saved.verifier || saved.uid !== session.user.id || !safeEqual(state, saved.state) || !code) {
      throw new AppError("CSRF", "The authorization request expired or was invalid. Please try connecting again.");
    }

    const tokens = await exchangeCode(code, saved.verifier);
    const granted = (tokens.scope ?? "").split(" ");
    if (!granted.includes("https://www.googleapis.com/auth/gmail.send")) {
      throw new AppError("PROVIDER_AUTH", "Gmail send permission was not granted. Please allow sending email when prompted.");
    }
    if (!tokens.refresh_token) {
      throw new AppError("PROVIDER_AUTH", "Google did not return a refresh token. Remove the app from your Google account permissions and connect again.");
    }
    const profile = await fetchGoogleUser(tokens.access_token);

    const previous = await db().emailAccount.findUnique({ where: { userId_provider: { userId: session.user.id, provider: "GMAIL" } } });
    const switching = !!previous && previous.email.toLowerCase() !== profile.email;
    if (switching) {
      const blocked = await senderChangeBlocker(session.user.id, previous.id);
      if (blocked) {
        await revokeToken(tokens.refresh_token);
        throw new AppError("INVALID_STATE", blocked);
      }
    }

    await db().emailAccount.upsert({
      where: { userId_provider: { userId: session.user.id, provider: "GMAIL" } },
      create: {
        userId: session.user.id,
        provider: "GMAIL",
        email: profile.email,
        displayName: profile.name,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope ?? GOOGLE_SCOPES.join(" "),
      },
      update: {
        email: profile.email,
        displayName: profile.name,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope ?? GOOGLE_SCOPES.join(" "),
      },
    });
    if (switching) {
      const oldToken = previous.refreshTokenEnc ?? previous.accessTokenEnc;
      if (oldToken) {
        try {
          await revokeToken(decryptSecret(oldToken));
        } catch {
          // The old tokens are already overwritten; revocation is best effort.
        }
      }
      await logActivity({ category: "AUTH", userId: session.user.id, message: `Gmail sender switched from ${previous.email} to ${profile.email}` });
    } else {
      await logActivity({ category: "AUTH", userId: session.user.id, message: `Gmail account connected: ${profile.email}` });
    }
    return settingsRedirect({ oauth: "connected" }, back);
  } catch (err) {
    const message = err instanceof AppError || err instanceof ProviderError ? err.message : "Could not connect Gmail. Please try again.";
    await logActivity({ category: "AUTH", level: "ERROR", userId: session.user.id, message: `Gmail connection failed: ${errorMessage(err)}` });
    return settingsRedirect({ oauth: "error", message }, back);
  }
}
