import "server-only";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env, invalidateEnvCache } from "@/lib/env";
import { AppError } from "@/lib/errors";

export interface GroqConfigStatus {
  configured: boolean;
  maskedKey: string;
  model: string;
  availableModels: { id: string; label: string; desc: string }[];
}

export const GROQ_MODELS = [
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Recommended)", desc: "Deep reasoning, high quality email personalization" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", desc: "Fast, lightweight model for high-throughput drafting" },
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", desc: "Balanced performance and natural conversational tone" },
];

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return `${key.slice(0, 3)}...${key.slice(-2)}`;
  return `${key.slice(0, 8)}...${key.slice(-6)}`;
}

export function getGroqStatus(): GroqConfigStatus {
  const e = env();
  const key = e.GROQ_API_KEY || "";
  return {
    configured: key.length > 0,
    maskedKey: maskApiKey(key),
    model: e.GROQ_MODEL || "openai/gpt-oss-120b",
    availableModels: GROQ_MODELS,
  };
}

export async function verifyGroqKey(apiKey: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - started;
    if (res.ok) {
      return { ok: true, latencyMs };
    }

    let detail = `Groq HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data?.error?.message) detail = data.error.message;
    } catch {
      // ignore json parse error
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, latencyMs, error: "Groq rejected the API key. Please check that the key begins with 'gsk_' and is valid." };
    }
    return { ok: false, latencyMs, error: detail };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, error: err instanceof Error ? err.message : "Failed to reach Groq API" };
  }
}

export async function updateGroqConfig(apiKey: string, model?: string): Promise<GroqConfigStatus> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new AppError("VALIDATION", "Please enter a valid Groq API key.");
  }

  // Live verification
  const check = await verifyGroqKey(cleanKey);
  if (!check.ok) {
    throw new AppError("VALIDATION", check.error || "Groq rejected this API key.");
  }

  const selectedModel = model?.trim() || env().GROQ_MODEL || "openai/gpt-oss-120b";

  // Update running process environment
  process.env.GROQ_API_KEY = cleanKey;
  process.env.GROQ_MODEL = selectedModel;

  // Persist to .env file
  try {
    const envPath = join(process.cwd(), ".env");
    let content = "";
    try {
      content = readFileSync(envPath, "utf-8");
    } catch {
      content = "";
    }

    const keyLine = `GROQ_API_KEY="${cleanKey}"`;
    const modelLine = `GROQ_MODEL="${selectedModel}"`;

    if (/^GROQ_API_KEY=.*$/m.test(content)) {
      content = content.replace(/^GROQ_API_KEY=.*$/m, keyLine);
    } else {
      content += `\n${keyLine}`;
    }

    if (/^GROQ_MODEL=.*$/m.test(content)) {
      content = content.replace(/^GROQ_MODEL=.*$/m, modelLine);
    } else {
      content += `\n${modelLine}`;
    }

    writeFileSync(envPath, content.trim() + "\n", "utf-8");
  } catch (err) {
    console.error("[Groq Settings] Failed to write .env file:", err);
  }

  invalidateEnvCache();
  return getGroqStatus();
}
