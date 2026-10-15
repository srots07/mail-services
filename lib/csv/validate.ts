// Pragmatic RFC 5322 subset: local@domain.tld, no spaces, single @, valid label chars.
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(email: string): boolean {
  if (email.length > 254 || !EMAIL_RE.test(email)) return false;
  const [local, domain] = email.split("@");
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const tld = domain.split(".").pop() ?? "";
  return /^[A-Za-z]{2,}$|^xn--[A-Za-z0-9-]+$/.test(tld);
}

/** Strips control characters (keeps newlines/tabs), normalises line endings and trims. */
export function sanitizeCell(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return "";
  const s = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, "")
    .trim();
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}
