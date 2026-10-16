import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession, type ActiveSession, type SessionUser } from "@/lib/auth/session";
import { assertCsrfToken, assertSameOrigin, isMutation } from "@/lib/auth/csrf";
import { enforceRateLimit, RATE_LIMITS, type RateLimitRule } from "@/lib/auth/rateLimit";
import { AppError } from "@/lib/errors";
import { Prisma } from "@/lib/generated/prisma/client";
import { redactString } from "@/lib/services/logs";

export interface ApiContext<P> {
  req: NextRequest;
  params: P;
}

export interface AuthedContext<P> extends ApiContext<P> {
  user: SessionUser;
  session: ActiveSession;
}

interface Options {
  rateLimit?: RateLimitRule;
}

type RouteHandler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const first = details[0];
    return NextResponse.json(
      { error: { code: "VALIDATION", message: first ? `${first.path || "input"}: ${first.message}` : "Invalid input.", details } },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: { code: "CONFLICT", message: "This record already exists." } }, { status: 409 });
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "The requested record was not found." } }, { status: 404 });
    }
    if (err.code === "P2021" || (err.code === "P2010" && err.message.includes("does not exist"))) {
      console.error("[api] database schema missing", err.message);
      throw new AppError("DATABASE_SCHEMA", "Database tables are missing. Please run 'npx prisma db push' to create your database tables.");
    }
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error("[api] database unavailable", redactString(err.message));
    throw new AppError("DATABASE", "Cannot connect to the database. Please verify your DATABASE_URL in Netlify environment variables.");
  }
  if (err instanceof Error) {
    if (err.message.includes("DATABASE_URL is not configured")) {
      throw new AppError("CONFIG_ERROR", "DATABASE_URL is not set in Netlify environment variables.");
    }
    if (err.message.includes("relation") && err.message.includes("does not exist")) {
      throw new AppError("DATABASE_SCHEMA", "Database tables are not initialized. Please run 'npx prisma db push'.");
    }
    if (err.message.includes("password authentication failed") || err.message.includes("ETIMEDOUT") || err.message.includes("ECONNREFUSED")) {
      throw new AppError("DATABASE", "Database connection failed. Please check your database host and password in DATABASE_URL.");
    }
  }
  console.error("[api] unhandled error", err instanceof Error ? redactString(err.stack ?? err.message) : err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/** Public endpoint (login/register). Still enforces same-origin for mutations and IP rate limiting. */
export function publicRoute<P = Record<string, never>>(
  options: Options,
  handler: (ctx: ApiContext<P>) => Promise<Response>,
): RouteHandler<P> {
  return async (req, ctx) => {
    try {
      if (isMutation(req)) assertSameOrigin(req);
      await enforceRateLimit(options.rateLimit ?? RATE_LIMITS.api, `ip:${clientIp(req)}`);
      return await handler({ req, params: await ctx.params });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Authenticated endpoint: session required, CSRF + origin checks on mutations, per-user rate limiting. */
export function authedRoute<P = Record<string, never>>(
  options: Options,
  handler: (ctx: AuthedContext<P>) => Promise<Response>,
): RouteHandler<P> {
  return async (req, ctx) => {
    try {
      const session = await getSession();
      if (!session) throw new AppError("UNAUTHORIZED", "Your session has expired. Please sign in again.");
      if (isMutation(req)) {
        assertSameOrigin(req);
        assertCsrfToken(req, session.csrfToken);
      }
      await enforceRateLimit(options.rateLimit ?? RATE_LIMITS.api, `user:${session.user.id}`);
      return await handler({ req, params: await ctx.params, user: session.user, session });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export async function readJson<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("VALIDATION", "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}
