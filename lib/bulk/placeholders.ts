/**
 * Deterministic placeholder replacement for bulk outreach. The user's body is the email: everything
 * outside a recognised [placeholder] is kept byte for byte.
 */

export interface BulkSender {
  senderName: string;
  designation: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface BulkRecipient {
  customerName: string;
  companyName: string;
  /** From name on this row of the contact file; falls back to the sender profile name. */
  fromName?: string | null;
}

export interface RenderInput {
  body: string;
  subjectTemplate: string;
  recipient: BulkRecipient;
  sender: BulkSender;
  /** Text for [product line / test program]; may itself contain [Company Name]. */
  productLineFallback?: string | null;
}

export interface RenderResult {
  subject: string;
  body: string;
  problems: string[];
}

export const DEFAULT_PRODUCT_LINE = "[Company Name] product line / test program";

type Key = "customer" | "company" | "fromName" | "productLine" | "senderName" | "designation" | "senderCompany" | "phone" | "email" | "website";

export const SENDER_PLACEHOLDER_KEYS: readonly Key[] = ["fromName", "senderName", "designation", "senderCompany", "phone", "email", "website"];

const ALIASES: Record<Key, string[]> = {
  customer: ["customer name", "customer", "name", "recipient name", "contact name", "first name", "to name", "to"],
  company: ["company name", "company", "customer company", "recipient company"],
  fromName: ["from name", "from", "from person name"],
  productLine: ["product line / test program", "product line/test program", "product line", "test program", "product line or test program"],
  senderName: ["your name", "sender name", "my name"],
  designation: ["designation", "your designation", "title", "your title", "job title"],
  senderCompany: ["your company", "sender company", "my company"],
  phone: ["phone", "phone number", "your phone", "your phone number", "mobile", "contact number"],
  email: ["email", "your email", "email address", "sender email"],
  website: ["website", "your website", "company website", "web"],
};

export const PLACEHOLDER_LABELS: Record<Key, string> = {
  customer: "To name (from the file)",
  company: "Company name (from the file)",
  fromName: "From name (from the file, else sender name)",
  productLine: "Product line / test program",
  senderName: "Sender name",
  designation: "Sender designation",
  senderCompany: "Sender company",
  phone: "Sender phone",
  email: "Sender email",
  website: "Sender website",
};

const TOKEN_RE = /\[([^[\]\n]{1,80})\]/g;

function normalizeToken(inner: string): string {
  return inner.toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
}

const LOOKUP = new Map<string, Key>();
for (const [key, aliases] of Object.entries(ALIASES) as [Key, string[]][]) for (const a of aliases) LOOKUP.set(normalizeToken(a), key);

export function placeholderKey(token: string): Key | null {
  return LOOKUP.get(normalizeToken(token.replace(/^\[|\]$/g, ""))) ?? null;
}

/** Every [token] in the text with what it maps to (null = not supported). */
export function detectPlaceholders(text: string): { token: string; key: Key | null; label: string | null }[] {
  const seen = new Map<string, { token: string; key: Key | null; label: string | null }>();
  for (const m of text.matchAll(TOKEN_RE)) {
    if (seen.has(m[0])) continue;
    const key = placeholderKey(m[1]);
    seen.set(m[0], { token: m[0], key, label: key ? PLACEHOLDER_LABELS[key] : null });
  }
  return [...seen.values()];
}

function valueFor(key: Key, input: RenderInput): string | null {
  const { recipient, sender } = input;
  switch (key) {
    case "customer":
      return recipient.customerName.trim() || null;
    case "company":
      return recipient.companyName.trim() || null;
    case "fromName":
      return recipient.fromName?.trim() || sender.senderName.trim() || null;
    case "productLine": {
      const text = input.productLineFallback?.trim() || DEFAULT_PRODUCT_LINE;
      return text.replace(TOKEN_RE, (t, inner: string) => {
        const k = placeholderKey(inner);
        return k && k !== "productLine" ? (valueFor(k, input) ?? t) : t;
      });
    }
    case "senderName":
      return sender.senderName.trim() || null;
    case "designation":
      return sender.designation?.trim() || null;
    case "senderCompany":
      return sender.companyName?.trim() || null;
    case "phone":
      return sender.phone?.trim() || null;
    case "email":
      return sender.email?.trim() || null;
    case "website":
      return sender.website?.trim() || null;
  }
}

const DROPPED = "\u0000";
const SENDER_KEYS = new Set<Key>(SENDER_PLACEHOLDER_KEYS);

function replaceIn(text: string, input: RenderInput, problems: Set<string>, dropEmptySender = false): string {
  return text.replace(TOKEN_RE, (token, inner: string) => {
    const key = placeholderKey(inner);
    if (!key) {
      problems.add(`Unsupported placeholder ${token}`);
      return token;
    }
    const value = valueFor(key, input);
    if (!value) {
      if (dropEmptySender && SENDER_KEYS.has(key)) return DROPPED;
      problems.add(`${PLACEHOLDER_LABELS[key]} is not set (needed for ${token})`);
      return token;
    }
    return value;
  });
}

/** Removes dropped placeholders with their separators ("[Phone] | [Email]" with no phone becomes the email); a line left empty is removed. */
function removeDropped(text: string): string {
  if (!text.includes(DROPPED)) return text;
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.includes(DROPPED)) {
      lines.push(line);
      continue;
    }
    const cleaned = line
      .replace(new RegExp(DROPPED, "g"), "")
      .replace(/\s*([|·•,])\s*(?:[|·•,]\s*)+/g, " $1 ")
      .replace(/^\s*[|·•,]\s*/, "")
      .replace(/\s*[|·•,:]\s*$/, "")
      .replace(/[ \t]{2,}/g, " ")
      .trimEnd();
    if (cleaned.trim()) lines.push(cleaned);
  }
  return lines.join("\n");
}

/** A signature line holds only placeholders and separators, e.g. "[Designation]" or "[Phone] | [Email]". */
function isSignatureLine(line: string): boolean {
  return line.includes("[") && !line.replace(TOKEN_RE, "").replace(/[|·•,:\s]/g, "");
}

/**
 * Fills recognised placeholders in one text; unknown or empty ones are left in place and reported.
 * With `dropEmptySender`, sender details that were not saved are removed from signature lines instead of
 * reported; inside a sentence they are still reported, since removing them would break the sentence.
 */
export function fillPlaceholderText(
  text: string,
  input: Omit<RenderInput, "body" | "subjectTemplate">,
  opts: { dropEmptySender?: boolean } = {},
): { text: string; problems: string[] } {
  const problems = new Set<string>();
  const full = { ...input, body: text, subjectTemplate: "" };
  const out = text
    .split("\n")
    .map((line) => replaceIn(line, full, problems, Boolean(opts.dropEmptySender) && isSignatureLine(line)))
    .join("\n");
  return { text: removeDropped(out), problems: [...problems] };
}

const SIGN_OFF_RE = /^((best|kind|warm|warmest)\s+)?(regards|wishes)[,!.]?$|^(sincerely|thanks|thank you|many thanks|cheers|yours (sincerely|truly|faithfully))[,!.]?$/i;

/** True when the body already places the sender details itself, so no signature is appended. */
export function hasSenderPlaceholders(body: string): boolean {
  return detectPlaceholders(body).some((p) => p.key !== null && SENDER_KEYS.has(p.key));
}

/** The fixed sender block added below every email: from name, designation, company, phone | email, website. */
export function senderSignature(sender: BulkSender, fromName?: string | null): string {
  const contact = [sender.phone?.trim(), sender.email?.trim()].filter(Boolean).join(" | ");
  return [fromName?.trim() || sender.senderName.trim(), sender.designation?.trim(), sender.companyName?.trim(), contact, sender.website?.trim()].filter(Boolean).join("\n");
}

/** Appends the sender block unless the body already uses sender placeholders. Directly after a sign-off it follows on the next line. */
export function withSignature(body: string, sender: BulkSender, fromName?: string | null): string {
  const signature = senderSignature(sender, fromName);
  if (!signature || hasSenderPlaceholders(body)) return body;
  const trimmed = body.replace(/\s+$/, "");
  const lastLine = trimmed.split("\n").pop()?.trim() ?? "";
  return `${trimmed}${SIGN_OFF_RE.test(lastLine) ? "\n" : "\n\n"}${signature}`;
}

/** One recipient's subject and body (with the sender signature). Problems (unknown or empty placeholders) block approval. */
export function renderBulkEmail(input: RenderInput): RenderResult {
  const problems = new Set<string>();
  const body = replaceIn(withSignature(input.body, input.sender, input.recipient.fromName), input, problems);
  const subject = replaceIn(input.subjectTemplate, input, problems).replace(/\s+/g, " ").trim();
  if (!input.body.trim()) problems.add("The email body is empty");
  if (!subject) problems.add("The subject is empty");
  if (subject.length > 200) problems.add("The subject is longer than 200 characters");
  return { subject, body, problems: [...problems] };
}

/** Any [token] still left in a final email (after edits or AI) is a problem. */
export function leftoverPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[0]))].filter((t) => placeholderKey(t) !== null);
}
