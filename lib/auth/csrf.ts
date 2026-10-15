import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isMutation(req: NextRequest): boolean {
  return !SAFE_METHODS.has(req.method.toUpperCase());
}

/** Rejects cross-origin state-changing requests (Origin / Referer must match this app). */
export function assertSameOrigin(req: NextRequest): void {
  const allowed = new Set<string>([req.nextUrl.origin]);
  try {
    allowed.add(new URL(env().APP_URL).origin);
  } catch {
    // ignore malformed APP_URL; request origin is still accepted
  }
  const origin = req.headers.get("origin");
  if (origin) {
    if (!allowed.has(origin)) throw new AppError("CSRF", "Request blocked: cross-site request detected.");
    return;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    let refOrigin = "";
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      // fall through to rejection
    }
    if (!allowed.has(refOrigin)) throw new AppError("CSRF", "Request blocked: cross-site request detected.");
    return;
  }
  throw new AppError("CSRF", "Request blocked: missing origin information.");
}

export function assertCsrfToken(req: NextRequest, expected: string): void {
  const provided = req.headers.get(CSRF_HEADER) ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("CSRF", "Your session security token is missing or expired. Please refresh the page.");
  }
}
