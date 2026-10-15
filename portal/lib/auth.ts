import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";

const COOKIE = "ecm_portal_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().session.create({ data: { id: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().isProduction,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(COOKIE);
}

export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await db().session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { subscription: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function requireUser(next: string) {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Rejects cross-site form/JSON posts to cookie-authenticated routes. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host || origin === env().APP_URL;
  } catch {
    return false;
  }
}

/** Only allow relative in-site redirects after login. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}
