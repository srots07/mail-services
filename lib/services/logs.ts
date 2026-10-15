import "server-only";
import { db } from "@/lib/database/prisma";
import type { LogCategory, LogLevel } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";

const SENSITIVE_KEY = /(token|secret|password|passwd|api[-_]?key|authorization|cookie|refresh|credential|private[-_]?key|jwt)/i;
const SENSITIVE_VALUE =
  /(sk-or-[A-Za-z0-9-_]+|ya29\.[A-Za-z0-9-_.]+|1\/\/[A-Za-z0-9-_]+|Bearer\s+[A-Za-z0-9-_.~+/]+=*|eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g;

export function redactString(value: string): string {
  return value.replace(SENSITIVE_VALUE, "[REDACTED]");
}

/** Deep-copies a value, dropping sensitive keys and masking token-shaped strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return redactString(value).slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LogInput {
  category: LogCategory;
  message: string;
  level?: LogLevel;
  userId?: string | null;
  campaignId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Writes many entries in one statement (e.g. one per scheduled recipient). Never throws. */
export async function logActivityMany(inputs: LogInput[]): Promise<void> {
  if (!inputs.length) return;
  try {
    for (let i = 0; i < inputs.length; i += 500) {
      await db().activityLog.createMany({
        data: inputs.slice(i, i + 500).map((input) => ({
          category: input.category,
          level: input.level ?? "INFO",
          message: redactString(input.message).slice(0, 1000),
          userId: input.userId ?? null,
          campaignId: input.campaignId ?? null,
          metadata: input.metadata ? (redact(input.metadata) as Prisma.InputJsonValue) : undefined,
        })),
      });
    }
  } catch (err) {
    console.error("[logs] failed to persist activity logs", err instanceof Error ? err.message : err);
  }
}

/** Writes an activity log entry. Never throws: logging must not break the main flow. */
export async function logActivity(input: LogInput): Promise<void> {
  const message = redactString(input.message).slice(0, 1000);
  const metadata = input.metadata ? (redact(input.metadata) as Prisma.InputJsonValue) : undefined;
  const level = input.level ?? "INFO";
  const line = `[${level}] [${input.category}] ${message}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.info(line);
  try {
    await db().activityLog.create({
      data: {
        category: input.category,
        level,
        message,
        userId: input.userId ?? null,
        campaignId: input.campaignId ?? null,
        metadata,
      },
    });
  } catch (err) {
    console.error("[logs] failed to persist activity log", err instanceof Error ? err.message : err);
  }
}
