import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authedRoute } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/auth/rateLimit";
import { randomToken } from "@/lib/crypto/tokens";
import { db } from "@/lib/database/prisma";
import { assertGoogleConfigured, buildAuthUrl } from "@/lib/email/google-oauth";
import { env } from "@/lib/env";
import { senderChangeBlocker } from "@/lib/services/providers";

const OAUTH_COOKIE = "ecm_oauth";

/** Pages Google may send the user back to after connecting. */
const RETURN_PATHS = new Set(["/settings"]);

export const GET = authedRoute({ rateLimit: RATE_LIMITS.auth }, async ({ user, req }) => {
  assertGoogleConfigured();
  const wanted = req.nextUrl.searchParams.get("return") ?? "";
  const ret = RETURN_PATHS.has(wanted) ? wanted : "/settings";

  const current = await db().emailAccount.findFirst({ where: { userId: user.id, provider: "GMAIL" }, select: { id: true } });
  const blocked = current ? await senderChangeBlocker(user.id, current.id) : null;
  if (blocked) return NextResponse.redirect(`${env().APP_URL}${ret}?${new URLSearchParams({ oauth: "error", message: blocked })}`);

  const state = randomToken(24);
  const verifier = randomToken(48);
  const store = await cookies();
  store.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, uid: user.id, ret }), {
    httpOnly: true,
    secure: env().isProduction && !env().desktopMode,
    sameSite: "lax",
    path: "/api/oauth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(buildAuthUrl(state, verifier));
});
