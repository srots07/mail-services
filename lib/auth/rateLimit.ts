import "server-only";
import { db } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors";

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSec: number;
}

export const RATE_LIMITS = {
  auth: { name: "auth", limit: 10, windowSec: 600 },
  api: { name: "api", limit: 300, windowSec: 60 },
  import: { name: "import", limit: 20, windowSec: 600 },
  generate: { name: "generate", limit: 30, windowSec: 60 },
  send: { name: "send", limit: 20, windowSec: 60 },
  testEmail: { name: "test-email", limit: 10, windowSec: 600 },
  research: { name: "research", limit: 30, windowSec: 600 },
} satisfies Record<string, RateLimitRule>;

/** Fixed-window limiter backed by Postgres so it works across instances and restarts. */
export async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const key = `${rule.name}:${subject}`.slice(0, 255);
  const windowSec = rule.windowSec;
  const rows = await db().$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets ("key", "count", "window_start")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limit_buckets.window_start < now() - (${windowSec}::int * interval '1 second')
                     THEN 1 ELSE rate_limit_buckets.count + 1 END,
      "window_start" = CASE WHEN rate_limit_buckets.window_start < now() - (${windowSec}::int * interval '1 second')
                     THEN now() ELSE rate_limit_buckets.window_start END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > rule.limit) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
  }
}
