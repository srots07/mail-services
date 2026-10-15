/** Exponential backoff with full jitter. attempt starts at 1. */
export function backoffDelay(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}
