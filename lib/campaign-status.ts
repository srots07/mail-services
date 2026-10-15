/** Needs a decision from the user: emails to review, a paused send, or failures to look at. */
export function needsAttention(c: { status: string; failedCount: number }): boolean {
  return c.status === "READY_FOR_REVIEW" || c.status === "PAUSED" || c.status === "FAILED" || c.failedCount > 0;
}
