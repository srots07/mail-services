import { z } from "zod";
import { authedRoute, ok, readJson } from "@/lib/api/handler";
import { env } from "@/lib/env";
import { getGroqStatus, updateGroqConfig, verifyGroqKey } from "@/lib/services/groq-settings";
import { logActivity } from "@/lib/services/logs";

const saveSchema = z.object({
  apiKey: z.string().trim().min(1, "Groq API key cannot be empty"),
  model: z.string().trim().optional(),
});

const testSchema = z.object({
  apiKey: z.string().trim().min(1, "Groq API key cannot be empty"),
});

export const GET = authedRoute({}, async () => {
  const status = getGroqStatus();
  return ok(status);
});

export const POST = authedRoute({}, async ({ req, user }) => {
  const input = await readJson(req, saveSchema);
  const updated = await updateGroqConfig(input.apiKey, input.model);
  await logActivity({
    category: "AUTH",
    userId: user.id,
    message: `Groq API key connected (model: ${updated.model})`,
  });
  return ok({ success: true, status: updated });
});

export const PUT = authedRoute({}, async ({ req }) => {
  const input = await readJson(req, testSchema);
  const keyToTest = input.apiKey === "current" ? env().GROQ_API_KEY : input.apiKey;
  const result = await verifyGroqKey(keyToTest);
  return ok(result);
});
