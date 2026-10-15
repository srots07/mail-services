import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { __portalPrisma?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.__portalPrisma) {
    const url = env().DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured.");
    globalForPrisma.__portalPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 5 }) });
  }
  return globalForPrisma.__portalPrisma;
}
