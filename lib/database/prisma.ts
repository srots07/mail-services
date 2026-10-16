import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

import pg from "pg";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  const { DATABASE_URL: url, DATABASE_POOL_MAX: max } = env();
  if (!url) {
    throw new Error("DATABASE_URL is not configured. See the setup instructions in README.md.");
  }
  const isCloud = url.includes("supabase") || url.includes("neon.tech") || url.includes("pooler") || url.includes("sslmode=require");
  const pool = new pg.Pool({
    connectionString: url,
    max,
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
