import "server-only";
import { env } from "@/lib/env";
import { parseRetryAfter } from "@/lib/queue/backoff";
import type { BuiltPrompt } from "./prompt";
import { parseModelOutput } from "./schema";
import { AiError, type AiAttemptResult, type AiProvider, type GenerateOptions } from "./types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

interface ChatResponse {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number | string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatJsonOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatJsonResult {
  content: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

/** Server-side Groq chat call in JSON mode with timeout and typed errors. */
export async function chatGroqJson(messages: ChatMessage[], opts: ChatJsonOptions = {}): Promise<ChatJsonResult> {
  const e = env();
  if (!e.GROQ_API_KEY) throw new AiError("NOT_CONFIGURED", "GROQ_API_KEY is not set");
  const model = e.GROQ_MODEL || "openai/gpt-oss-120b";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), e.AI_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${e.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4000,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    if (controller.signal.aborted) throw new AiError("TIMEOUT", `Groq request timed out after ${e.AI_TIMEOUT_MS}ms`);
    throw new AiError("NETWORK", err instanceof Error ? err.message : "Network error contacting Groq");
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  const latencyMs = Date.now() - started;
  let data: ChatResponse | null = null;
  try {
    data = (await res.json()) as ChatResponse;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error?.message?.slice(0, 300) ?? `Groq HTTP ${res.status}`;
    const retryAfterMs = parseRetryAfter(res.headers.get("retry-after")) ?? undefined;
    if (res.status === 429) throw new AiError("RATE_LIMIT", msg, { httpStatus: 429, retryAfterMs });
    if (res.status === 401 || res.status === 403) throw new AiError("AUTH", msg, { httpStatus: res.status });
    if (res.status === 408) throw new AiError("TIMEOUT", msg, { httpStatus: 408 });
    if (res.status >= 500) throw new AiError("SERVER", msg, { httpStatus: res.status, retryAfterMs });
    throw new AiError("BAD_REQUEST", msg, { httpStatus: res.status });
  }

  if (data?.error) {
    const code = Number(data.error.code);
    const msg = data.error.message?.slice(0, 300) ?? "Groq provider error";
    if (code === 429) throw new AiError("RATE_LIMIT", msg, { httpStatus: 429 });
    throw new AiError("SERVER", msg, { httpStatus: Number.isFinite(code) ? code : undefined });
  }

  const content = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new AiError("MALFORMED", "Empty response from Groq model", { httpStatus: res.status });

  return {
    content,
    model: data?.model ?? model,
    promptTokens: data?.usage?.prompt_tokens,
    completionTokens: data?.usage?.completion_tokens,
    latencyMs,
  };
}

export const groqProvider: AiProvider = {
  name: "groq",

  model() {
    return env().GROQ_MODEL || "openai/gpt-oss-120b";
  },

  async generate(prompt: BuiltPrompt, opts: GenerateOptions = {}): Promise<AiAttemptResult> {
    const messages: ChatMessage[] = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ];
    if (opts.strictJsonReminder) {
      messages.push({ role: "user", content: 'Your previous reply was not valid. Reply with ONLY a JSON object: {"subject": "...", "body": "..."}' });
    }
    if (opts.correction) {
      messages.push({
        role: "user",
        content: `Your previous draft was rejected: ${opts.correction}. Rewrite it for this recipient only, using only the supplied recipient data. Reply with ONLY the JSON object.`,
      });
    }

    const result = await chatGroqJson(messages, { signal: opts.signal });
    const parsed = parseModelOutput(result.content);
    if (!parsed.ok) throw new AiError("MALFORMED", parsed.reason);

    return {
      content: parsed.value,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
    };
  },
};
