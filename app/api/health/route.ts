import { NextResponse } from "next/server";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const e = env();
  const checks: Record<string, boolean | string> = {
    hasDatabaseUrl: Boolean(e.DATABASE_URL && e.DATABASE_URL.length > 0),
    hasSessionSecret: Boolean(e.SESSION_SECRET && e.SESSION_SECRET.length >= 32),
    hasEncryptionKey: Boolean(e.TOKEN_ENCRYPTION_KEY && e.TOKEN_ENCRYPTION_KEY.length > 0),
    appUrl: e.APP_URL,
    allowRegistration: e.allowRegistration,
    nodeEnv: e.NODE_ENV,
  };

  let dbOk = false;
  let tablesOk = false;
  let dbError: string | null = null;

  if (checks.hasDatabaseUrl) {
    try {
      await db().$queryRaw`SELECT 1`;
      dbOk = true;

      // Check if user and rate_limit_buckets tables exist
      const userCount = await db().user.count().catch(() => null);
      if (userCount !== null) {
        tablesOk = true;
      } else {
        dbError = "Database connected, but tables are missing. Run 'npx prisma db push'.";
      }
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  } else {
    dbError = "DATABASE_URL environment variable is missing.";
  }

  const allHealthy = dbOk && tablesOk && Boolean(checks.hasSessionSecret);

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "unhealthy",
      database: {
        connected: dbOk,
        tablesInitialized: tablesOk,
        error: dbError,
      },
      configuration: checks,
      hint: !tablesOk
        ? "If tables are missing, run 'npx prisma db push' from your terminal with your DATABASE_URL."
        : !dbOk
        ? "Check DATABASE_URL in your Netlify site settings (Site configuration -> Environment variables)."
        : "System is configured properly.",
    },
    { status: allHealthy ? 200 : 503 },
  );
}
