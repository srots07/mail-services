/** Pure scheduling helpers (no I/O) so timing rules are unit-testable. */

export interface ScheduleOptions {
  startMode: "now" | "at";
  startAt?: string | Date | null;
  intervalSeconds: number;
}

/** Grace period for "at" times that are a few seconds in the past by the time the request arrives. */
export const PAST_START_GRACE_MS = 60_000;

export function resolveStart(opts: Pick<ScheduleOptions, "startMode" | "startAt">, now: Date = new Date()): Date {
  if (opts.startMode === "now" || !opts.startAt) return now;
  const at = new Date(opts.startAt);
  if (Number.isNaN(at.getTime())) throw new RangeError("Invalid start date/time");
  if (at.getTime() < now.getTime() - PAST_START_GRACE_MS) throw new RangeError("The start time is in the past");
  return at.getTime() < now.getTime() ? now : at;
}

/** Recipient i is scheduled at start + i * interval. */
export function computeSchedule(start: Date, intervalSeconds: number, count: number): Date[] {
  const step = Math.max(0, Math.round(intervalSeconds)) * 1000;
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * step));
}

/** Where to continue a schedule: never in the past, never before the earliest pending slot. */
export function continueFrom(earliestPending: Date | null, now: Date = new Date()): Date {
  if (!earliestPending) return now;
  return earliestPending.getTime() > now.getTime() ? earliestPending : now;
}

/** Retries go after everything already scheduled. */
export function retryStart(lastScheduled: Date | null, intervalSeconds: number, now: Date = new Date()): Date {
  if (!lastScheduled) return now;
  const next = new Date(lastScheduled.getTime() + Math.max(0, intervalSeconds) * 1000);
  return next.getTime() > now.getTime() ? next : now;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** "2026-10-08" + "10:30" in "Asia/Kolkata" -> 2026-10-08T05:00:00Z. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new RangeError("Invalid date or time");
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown time zone "${timeZone}"`);
  const [y, m, day, hh, mm] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (m < 1 || m > 12 || day < 1 || day > 31 || hh > 23 || mm > 59) throw new RangeError("Invalid date or time");
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const first = zoneOffsetMs(guess, timeZone);
  let utc = guess - first;
  const second = zoneOffsetMs(utc, timeZone);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

export function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}
