import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { DESKTOP_TOKEN_HEADER, desktopTokenMatches } from "@/lib/auth/desktop";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getSession } from "@/lib/auth/session";
import { randomToken } from "@/lib/crypto/tokens";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/services/logs";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/api/") ? value : "/dashboard";
}

export async function GET(req: NextRequest) {
  const { autoLogin, desktopMode, DESKTOP_TOKEN, AUTO_LOGIN_EMAIL, APP_URL } = env();
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!autoLogin) return NextResponse.redirect(new URL("/login", APP_URL));

  try {
    if (!(await getSession())) {
      const provided = req.headers.get(DESKTOP_TOKEN_HEADER) ?? req.nextUrl.searchParams.get("token");
      if (desktopMode && !desktopTokenMatches(DESKTOP_TOKEN, provided)) {
        return new NextResponse("Open Sorts from its desktop window.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      let user = await db().user.findUnique({ where: { email: AUTO_LOGIN_EMAIL }, select: { id: true } });
      if (!user) {
        user = await db().user.create({
          data: { email: AUTO_LOGIN_EMAIL, name: "Owner", passwordHash: await hashPassword(randomToken(32)) },
          select: { id: true },
        });
        await logActivity({ category: "AUTH", userId: user.id, message: `Auto-login account created for ${AUTO_LOGIN_EMAIL}` });
      }
      await createSession(user.id, req.headers.get("user-agent"));
    }
    return NextResponse.redirect(new URL(next, APP_URL));
  } catch (err) {
    return toErrorResponse(err);
  }
}
