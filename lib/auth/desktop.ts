import { timingSafeEqual } from "node:crypto";

export const DESKTOP_TOKEN_HEADER = "x-desktop-token";

/** Constant-time check of the per-launch token the Electron shell passes to the local server. */
export function desktopTokenMatches(expected: string, provided: string | null | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
