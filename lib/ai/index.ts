import "server-only";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { mockAiProvider } from "./mock";
import { openRouterProvider } from "./openrouter";
import { groqProvider } from "./groq";
import type { AiProvider } from "./types";

/** Returns the selected provider; openrouter auto-falls back to Groq if OpenRouter fails. */
export function getAiProvider(choice: "openrouter" | "groq" | "mock" | string): AiProvider {
  if (choice === "mock") {
    if (env().isProduction) throw new AppError("NOT_CONFIGURED", "The mock AI provider is disabled in production.");
    return mockAiProvider;
  }
  if (choice === "groq") {
    return groqProvider;
  }
  return openRouterProvider;
}
