/** "E-mail Address" -> "e_mail_address", for matching file headers to known column names. */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\s\-./]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
