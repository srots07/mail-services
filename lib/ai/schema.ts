import { z } from "zod";

export const generatedEmailSchema = z.object({
  subject: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(3, "subject too short").max(200, "subject too long")),
  body: z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().min(40, "body too short").max(8000, "body too long")),
});

export type GeneratedEmailContent = z.infer<typeof generatedEmailSchema>;

export const PLACEHOLDER_RE =
  /\[\s*(?:your|recipient|company|sender|name|first[\s_-]*name|last[\s_-]*name|full[\s_-]*name|insert|contact|title|position|role|date|organi[sz]ation|email)[^\]]*\]|\{\{\s*[a-z_ ]+\s*\}\}|<\s*(?:name|company|recipient|first_name)\s*>/i;

/** Extracts and validates the JSON email object from raw model text. Returns null + reason if invalid. */
export function parseModelOutput(raw: string): { ok: true; value: GeneratedEmailContent } | { ok: false; reason: string } {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, reason: "Response did not contain a JSON object" };

  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, reason: "Response JSON could not be parsed" };
  }
  const parsed = generatedEmailSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, reason: `Response JSON invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}` };
  }
  if (PLACEHOLDER_RE.test(parsed.data.subject) || PLACEHOLDER_RE.test(parsed.data.body)) {
    return { ok: false, reason: "Response contained unfilled placeholders" };
  }
  return { ok: true, value: parsed.data };
}
