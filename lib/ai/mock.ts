import "server-only";
import { BULK_PROMPT_MARKER, extractBulkContext, extractBulkField } from "./bulk-email";
import type { BuiltPrompt } from "./prompt";
import { AiError, type AiAttemptResult, type AiProvider } from "./types";

/**
 * Development-only deterministic generator. Clearly labelled as mock output and never
 * available in production builds (see lib/env.ts). Returns the rendered body unchanged.
 */
export const mockAiProvider: AiProvider = {
  name: "mock",

  model() {
    return "mock/dev-template";
  },

  async generate(prompt: BuiltPrompt): Promise<AiAttemptResult> {
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
    if (!prompt.user.startsWith(BULK_PROMPT_MARKER)) throw new AiError("BAD_REQUEST", "The mock AI only supports campaign emails");
    const ctx = extractBulkContext(prompt.user);
    if (/mock-ai-fail/i.test(ctx.company_name ?? "")) throw new AiError("SERVER", "Simulated mock AI failure");
    const subject = extractBulkField(prompt.user, "fixed_subject") || `Exploring opportunities with ${ctx.company_name ?? "your team"}`;
    return { content: { subject: subject.slice(0, 200), body: extractBulkField(prompt.user, "rendered_body") }, model: "mock/dev-template", latencyMs: Date.now() - started };
  },
};
