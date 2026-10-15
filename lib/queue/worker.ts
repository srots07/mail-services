import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { generationTick, recoverStaleGeneration } from "./generation";
import { recoverStaleSending, sendingTick } from "./sending";

/** Scheduled emails go out within one tick of their scheduled time. */
const TICK_MS = 2000;
const RECOVERY_MS = 60_000;

interface WorkerState {
  started: boolean;
  timer?: ReturnType<typeof setInterval>;
  ticking: boolean;
  pending: boolean;
  lastRecovery: number;
}

const g = globalThis as unknown as { __campaignWorker?: WorkerState };
const worker: WorkerState = (g.__campaignWorker ??= { started: false, ticking: false, pending: false, lastRecovery: 0 });

async function tick(): Promise<void> {
  if (worker.ticking) {
    worker.pending = true;
    return;
  }
  worker.ticking = true;
  const recoveryDue = Date.now() - worker.lastRecovery > RECOVERY_MS;
  try {
    if (recoveryDue) {
      worker.lastRecovery = Date.now();
      await recoverStaleGeneration();
      await recoverStaleSending();
    }
    await generationTick(kickWorker);
    await sendingTick(kickWorker);
  } catch (err) {
    console.error("[worker] tick failed:", errorMessage(err));
  } finally {
    worker.ticking = false;
    if (worker.pending) {
      worker.pending = false;
      setTimeout(() => void tick(), 50);
    }
  }
}

/** Schedules an immediate tick (e.g. after a job finishes or a user enqueues work). */
export function kickWorker(): void {
  if (!worker.started) return;
  setTimeout(() => void tick(), 10);
}

const PROVIDER_KEYS = ["AI_PROVIDER", "EMAIL_PROVIDER"] as const;

/** Values in the .env file; Next.js never lets these override variables already set in the process. */
function dotenvValues(): Partial<Record<(typeof PROVIDER_KEYS)[number], string>> {
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    const out: Partial<Record<(typeof PROVIDER_KEYS)[number], string>> = {};
    for (const key of PROVIDER_KEYS) {
      const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\r\\n#]*)`, "m"));
      if (m) out[key] = m[1].trim();
    }
    return out;
  } catch {
    return {};
  }
}

function logProviderConfig(): void {
  const e = env();
  console.info(
    `[config] Default AI provider: ${e.aiProvider} | Default email provider: ${e.emailProvider}${e.isProduction ? " (production)" : " (users can override in Settings)"}`,
  );
  if (e.isProduction) return;
  const file = dotenvValues();
  for (const key of PROVIDER_KEYS) {
    const fromProcess = process.env[key];
    if (file[key] !== undefined && fromProcess !== undefined && fromProcess !== file[key]) {
      console.warn(`[config] WARNING: ${key}="${fromProcess}" comes from the shell environment and overrides "${file[key]}" in .env. Restart from a clean terminal to use the .env value.`);
    }
  }
}

/**
 * Starts the single in-process queue worker. Designed for one long-running Node.js server
 * process; queue claims use SKIP LOCKED so accidental extra instances do not double-process.
 */
export async function startWorker(): Promise<void> {
  if (worker.started) return;
  if (!env().DATABASE_URL) {
    console.warn("[worker] DATABASE_URL not set; queue worker not started");
    return;
  }
  worker.started = true;
  logProviderConfig();
  try {
    // Startup recovery: anything marked in-flight belongs to a previous process.
    await recoverStaleGeneration(0);
    await recoverStaleSending(0);
    const due = await db().campaignContact.count({ where: { status: "SCHEDULED", campaign: { status: { in: ["SCHEDULED", "RUNNING"] } } } });
    if (due > 0) console.info(`[worker] ${due} scheduled emails pending; they are sent at their scheduled times`);
    worker.lastRecovery = Date.now();
  } catch (err) {
    console.error("[worker] startup recovery failed:", errorMessage(err));
  }
  worker.timer = setInterval(() => void tick(), TICK_MS);
  console.info("[worker] campaign queue worker started");
}
