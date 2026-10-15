export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// Fixed locale: server-rendered and client-hydrated text must match regardless of the browser's language.
const LOCALE = "en-US";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(LOCALE, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Full timestamp including seconds, for per-recipient schedules. */
export function formatDateTimeFull(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(LOCALE, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
