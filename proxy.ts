import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ecm_session";
const PUBLIC_PATHS = ["/login", "/register"];

function autoLoginEnabled(): boolean {
  if (process.env.DESKTOP_MODE?.toLowerCase() === "true") return true;
  return process.env.NODE_ENV !== "production" && process.env.AUTO_LOGIN?.toLowerCase() === "true";
}

/**
 * Optimistic redirect for unauthenticated page requests. Real session validation and
 * authorization happen in pages (requireUser) and API handlers (authedRoute).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && (!isPublic || autoLoginEnabled())) {
    const url = request.nextUrl.clone();
    url.pathname = autoLoginEnabled() ? "/api/auth/auto" : "/login";
    url.search = pathname === "/" || isPublic ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
