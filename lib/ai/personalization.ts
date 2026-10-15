import { PLACEHOLDER_RE } from "./schema";

export interface RecipientIdentity {
  /** Row id; identifies "self" among peers when the address is not known yet. */
  id?: string;
  email: string;
  name?: string | null;
  company?: string | null;
}

export interface SelfRecipient extends RecipientIdentity {
  /** All other data supplied for this recipient (context, sender, details...). Peer names found here are legitimate. */
  suppliedText?: string;
  /** False when the sender wrote the body themselves and it need not name the company. Defaults to true. */
  requireCompany?: boolean;
}

export interface PersonalizationResult {
  ok: boolean;
  problems: string[];
}

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "madam", "dear"]);
const COMPANY_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "gmbh", "ag", "sa", "sas", "bv", "nv",
  "pvt", "private", "pte", "pty", "srl", "oy", "ab", "as", "kk", "group", "holdings",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function words(s: string): string[] {
  return s.split(/[\s,]+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
}

/** Case-insensitive whole-word/phrase containment that tolerates punctuation and unicode letters. */
export function containsPhrase(text: string, phrase: string, caseSensitive = false): boolean {
  const p = phrase.trim();
  if (!p) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, caseSensitive ? "u" : "iu");
  return re.test(text);
}

export function nameParts(name: string | null | undefined): { first: string; last: string; full: string } {
  const parts = words(name ?? "").filter((w) => !HONORIFICS.has(w.toLowerCase()));
  return { first: parts[0] ?? "", last: parts.length > 1 ? parts[parts.length - 1] : "", full: parts.join(" ") };
}

/** Company name without legal suffixes ("Acme Robotics, Inc." -> "Acme Robotics"). */
export function companyCore(company: string | null | undefined): string {
  const parts = words(company ?? "");
  while (parts.length > 1 && COMPANY_SUFFIXES.has(parts[parts.length - 1].toLowerCase().replace(/\./g, ""))) parts.pop();
  return parts.join(" ");
}

function mentionsCompany(text: string, company: string): boolean {
  const core = companyCore(company);
  if (!core) return true;
  if (containsPhrase(text, core) || containsPhrase(text, company)) return true;
  const first = core.split(" ")[0];
  return core.includes(" ") && first.length >= 4 && containsPhrase(text, first);
}

function wordCount(s: string | null | undefined): number {
  return words(s ?? "").length;
}

/** For a sender-written body: the adapted version may only add a greeting/sign-off, not new paragraphs. */
export function lightEditProblems(original: string, adapted: string | null | undefined): string[] {
  const before = wordCount(original);
  const after = wordCount(adapted);
  const limit = Math.max(Math.round(before * 1.25), before + 15);
  return after > limit
    ? [`Added new text to the sender-written body (${after} words vs ${before}); keep the sender's text and change only names, references, greeting and sign-off`]
    : [];
}

/**
 * Verifies that generated content is personalised for exactly this recipient: subject and body
 * present, the recipient's name and company appear, no unfilled placeholders, and no other
 * recipient's name, company or email address leaks in.
 */
export function validatePersonalization(
  content: { subject: string | null | undefined; body: string | null | undefined },
  self: SelfRecipient,
  peers: RecipientIdentity[] = [],
): PersonalizationResult {
  const problems: string[] = [];
  const subject = (content.subject ?? "").trim();
  const body = (content.body ?? "").trim();
  if (!subject) problems.push("Subject is empty");
  if (!body) problems.push("Body is empty");
  if (!subject || !body) return { ok: false, problems };

  const text = `${subject}\n${body}`;
  if (PLACEHOLDER_RE.test(text)) problems.push("Contains an unfilled placeholder");

  const me = nameParts(self.name);
  if (me.first && !containsPhrase(body, me.first) && !(me.last && containsPhrase(body, me.last))) {
    problems.push(`Does not address the recipient by name (${me.full})`);
  }
  if (self.requireCompany !== false && self.company?.trim() && !mentionsCompany(text, self.company)) {
    problems.push(`Does not mention the recipient's company (${self.company.trim()})`);
  }

  const allowed = `${self.name ?? ""}\n${self.company ?? ""}\n${self.email}\n${self.suppliedText ?? ""}`;
  const allowedLower = allowed.toLowerCase();
  const selfEmail = self.email.trim().toLowerCase();
  const leaked = new Set<string>();
  for (const peer of peers) {
    if (self.id && peer.id ? peer.id === self.id : selfEmail && peer.email.trim().toLowerCase() === selfEmail) continue;
    const peerEmail = peer.email.trim().toLowerCase();
    if (peerEmail && !allowedLower.includes(peerEmail) && text.toLowerCase().includes(peerEmail)) leaked.add(`email ${peer.email}`);

    const p = nameParts(peer.name);
    if (p.full && p.full.length >= 3 && !containsPhrase(allowed, p.full) && containsPhrase(text, p.full)) {
      leaked.add(`name "${p.full}"`);
    } else if (p.first.length >= 3 && !containsPhrase(allowed, p.first) && containsPhrase(body.split("\n")[0] ?? "", p.first, true)) {
      leaked.add(`name "${p.first}" in greeting`);
    }

    const core = companyCore(peer.company);
    if (core.length >= 3 && !containsPhrase(allowed, core) && containsPhrase(text, core)) leaked.add(`company "${core}"`);
  }
  if (leaked.size) problems.push(`Mentions another recipient's ${[...leaked].slice(0, 3).join(", ")}`);

  return { ok: problems.length === 0, problems };
}
