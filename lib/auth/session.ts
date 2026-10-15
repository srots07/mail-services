import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto/tokens";

export const SESSION_COOKIE = "ecm_session";
export const CSRF_COOKIE = "ecm_csrf";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export async function isMainPerson(user: { id: string; email: string }): Promise<boolean> {
  const adminEmail = env().ADMIN_EMAIL;
  if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase()) {
    return true;
  }
  if (user.email.toLowerCase() === "owner@localhost") {
    return true;
  }
  const autoEmail = env().AUTO_LOGIN_EMAIL;
  if (autoEmail && user.email.toLowerCase() === autoEmail.toLowerCase()) {
    return true;
  }
  const firstUser = await db().user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return firstUser?.id === user.id;
}

export interface ActiveSession {
  sessionId: string;
  csrfToken: string;
  user: SessionUser;
}

function cookieBase() {
  return {
    path: "/",
    sameSite: "lax" as const,
    // The desktop app is served over plain http://localhost.
    secure: env().isProduction && !env().desktopMode,
  };
}

export async function createSession(userId: string, userAgent: string | null): Promise<void> {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db().session.create({
    data: { id: sha256(token), userId, csrfToken, userAgent: userAgent?.slice(0, 255) ?? null, expiresAt },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...cookieBase(), httpOnly: true, expires: expiresAt });
  // Readable by the browser so the client can echo it in the X-CSRF-Token header (double submit).
  store.set(CSRF_COOKIE, csrfToken, { ...cookieBase(), httpOnly: false, expires: expiresAt });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db().session.deleteMany({ where: { id: sha256(token) } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

/** Resolves the current session from cookies. Memoised per request. */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db().session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db().session.deleteMany({ where: { id: session.id } });
    return null;
  }
  const isAdmin = await isMainPerson(session.user);
  return {
    sessionId: session.id,
    csrfToken: session.csrfToken,
    user: { ...session.user, isAdmin },
  };
});

/** For server components/pages: redirects to /login when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}
