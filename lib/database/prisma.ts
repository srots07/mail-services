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
  const isCloud = rawUrl.includes("supabase") || rawUrl.includes("neon.tech") || rawUrl.includes("pooler") || rawUrl.includes("sslmode=");
  let cleanUrl = rawUrl;
  // Automatically switch Supabase pooler from session mode (:5432 - max 15 conns) to transaction mode (:6543 - unlimited pool)
  if (cleanUrl.includes("pooler.supabase.com:5432")) {
    cleanUrl = cleanUrl.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543");
    if (!cleanUrl.includes("pgbouncer=true")) {
      cleanUrl += (cleanUrl.includes("?") ? "&" : "?") + "pgbouncer=true";
    }
  }
  // Strip ?sslmode=... so pg doesn't override rejectUnauthorized: false
  cleanUrl = isCloud ? cleanUrl.replace(/[?&]sslmode=[^&]+/g, "").replace(/\?$/, "") : cleanUrl;
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
