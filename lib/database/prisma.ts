import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

import pg from "pg";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  const { DATABASE_URL: rawUrl, DATABASE_POOL_MAX: max } = env();
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not configured. See the setup instructions in README.md.");
  }
  let cleanUrl = rawUrl;
  let isCloud = false;
  try {
    const u = new URL(rawUrl);
    isCloud = u.hostname.includes("supabase") || u.hostname.includes("neon.tech") || u.hostname.includes("pooler");
    if (u.hostname.includes("pooler.supabase.com")) {
      u.port = "6543";
      u.searchParams.set("pgbouncer", "true");
    }
    // Remove sslmode so pg doesn't override rejectUnauthorized
    u.searchParams.delete("sslmode");
    cleanUrl = u.toString();
  } catch {
    cleanUrl = rawUrl;
  }

  const pool = new pg.Pool({
    connectionString: cleanUrl,
    max: isCloud ? Math.min(max, 3) : max,
    ssl: isCloud ? { rejectUnauthorized: false } : undefined,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export function db(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createClient();
  }
  return globalForPrisma.__prisma;
}

export { Prisma } from "@/lib/generated/prisma/client";
