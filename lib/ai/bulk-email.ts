import { leftoverPlaceholders } from "@/lib/bulk/placeholders";
import { lightEditProblems, validatePersonalization, type RecipientIdentity } from "./personalization";
import type { BuiltPrompt } from "./prompt";

export const NOT_AVAILABLE = "NOT_AVAILABLE";
export const BULK_PROMPT_MARKER = "<bulk_outreach_email>";

export interface BulkAiInput {
  /** Body after placeholder replacement and with the sender signature: the text the AI must stay faithful to. */
  renderedBody: string;
  /** Rendered fixed subject, or null when the AI writes the subject. */
  fixedSubject: string | null;
  aiBody: boolean;
  instructions: string | null;
  customerName: string;
  companyName: string;
  fromName: string | null;
  /** Other columns of this contact's row in the uploaded file. */
  extra: Record<string, string>;
}

const SYSTEM = `You prepare ONE business email, already written by the sender, for one contact from the sender's contact file.
Rules:
- Keep the sender's format exactly: every paragraph, bullet point, line break, claim and the signature block stay in place and in order.
- When "personalisation" is enabled you may (a) adjust short phrases so the email reads naturally for this contact and company, and (b) add at most ONE short sentence inside an existing paragraph that uses details from <contact_details>. Never add paragraphs, bullet points, statistics, products, prices or promises.
- Use ONLY the facts in <contact_details>. Any value equal to ${NOT_AVAILABLE} is unknown: do not guess or invent it.
- Address the contact by their name and keep the company name correct. Never mention any other company or person.
- Do not change the signature block at the end.
- Subjects: short, professional, specific to this company, at most 12 words, no clickbait, no emojis, no placeholders.
- Return JSON only: {"subject": "...", "body": "..."}`;

export function buildBulkPrompt(input: BulkAiInput): BuiltPrompt {
  const ctx = {
    to_name: input.customerName,
    company_name: input.companyName,
    from_name: input.fromName?.trim() || NOT_AVAILABLE,
    ...Object.fromEntries(Object.entries(input.extra).map(([k, v]) => [k.slice(0, 100), v.slice(0, 5000)])),
  };
  const user = [
    BULK_PROMPT_MARKER,
    `<contact_details>\n${JSON.stringify(ctx, null, 2)}\n</contact_details>`,
    input.fixedSubject
      ? `<fixed_subject>\n${input.fixedSubject}\n</fixed_subject>\nReturn this subject unchanged.`
      : "Write the subject for this contact.",
    input.aiBody ? "Personalisation: ENABLED." : "Personalisation: DISABLED. Return the body exactly as given.",
    input.instructions?.trim() ? `<sender_instructions>\n${input.instructions.trim()}\n</sender_instructions>` : "",
    `<rendered_body>\n${input.renderedBody}\n</rendered_body>`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system: SYSTEM, user };
}

export function extractBulkField(user: string, tag: "rendered_body" | "fixed_subject"): string {
  return user.match(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`))?.[1] ?? "";
}

export function extractBulkContext(user: string): Record<string, string> {
  try {
    return JSON.parse(user.match(/<contact_details>\n([\s\S]*?)\n<\/contact_details>/)?.[1] ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

const paragraphs = (s: string) => s.trim().split(/\n\s*\n/).filter((p) => p.trim()).length;
const bullets = (s: string) => s.split("\n").filter((l) => /^\s*([-*\u2022]|\d+[.)])\s+/.test(l)).length;

/** Checks an AI-adjusted body against the sender's rendered body. */
export function bulkBodyProblems(rendered: string, adapted: string): string[] {
  const problems = [...lightEditProblems(rendered, adapted)];
  if (paragraphs(rendered) !== paragraphs(adapted)) problems.push("Changed the number of paragraphs");
  if (bullets(rendered) !== bullets(adapted)) problems.push("Changed the bullet points");
  const left = leftoverPlaceholders(adapted);
  if (left.length) problems.push(`Unreplaced placeholders: ${left.join(", ")}`);
  return problems;
}

export function bulkSubjectProblems(subject: string): string[] {
  const problems: string[] = [];
  const s = subject.trim();
  if (!s) problems.push("Subject is empty");
  if (s.length > 200) problems.push("Subject is longer than 200 characters");
  if (s.split(/\s+/).length > 16) problems.push("Subject is too long");
  const left = leftoverPlaceholders(s);
  if (left.length) problems.push(`Unreplaced placeholders: ${left.join(", ")}`);
  return problems;
}

/** Leakage and identity checks reused from the personalised generator. */
export function bulkLeakProblems(
  content: { subject: string; body: string },
  self: { id: string; name: string; company: string; renderedBody: string; supplied?: string },
  peers: RecipientIdentity[],
): string[] {
  const nameInBody = self.renderedBody.toLowerCase().includes(self.name.split(/\s+/)[0]?.toLowerCase() ?? "");
  const companyInText = self.renderedBody.toLowerCase().includes(self.company.toLowerCase());
  return validatePersonalization(
    content,
    { id: self.id, email: "", name: nameInBody ? self.name : null, company: self.company, requireCompany: companyInText, suppliedText: [self.renderedBody, self.supplied].filter(Boolean).join("\n") },
    peers,
  ).problems;
}
