import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "violet";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-panel-3 text-muted border-line-strong",
  accent: "bg-accent-soft text-accent-strong border-accent/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
  violet: "bg-violet-soft text-violet border-violet/30",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
  live,
  wrap,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
  live?: boolean;
  /** Allow long content (e.g. user text) to wrap instead of overflowing. */
  wrap?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm border px-1.5 py-0.5 type-badge",
        wrap ? "break-all" : "whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("led", live && "led-live")} />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  GENERATING: "info",
  READY_FOR_REVIEW: "violet",
  SCHEDULED: "accent",
  RUNNING: "info",
  SENDING: "info",
  COMPLETED: "success",
  PAUSED: "warning",
  FAILED: "danger",
  NEW: "neutral",
  READY: "violet",
  PENDING: "neutral",
  APPROVED: "accent",
  SENT: "success",
  SKIPPED: "neutral",
  REJECTED: "danger",
  GENERATED: "violet",
  QUEUED: "neutral",
};

export const LIVE_STATUSES = new Set(["GENERATING", "RUNNING", "SENDING"]);

const STATUS_LABELS: Record<string, string> = {
  READY_FOR_REVIEW: "Needs review",
  READY: "Ready for review",
  RUNNING: "Sending",
  NEW: "Not generated",
  SCHEDULED: "Scheduled",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} dot live={LIVE_STATUSES.has(status)}>
      {statusLabel(status)}
    </Badge>
  );
}

/** Shared with charts so status color and badge tone stay aligned. */
export const STATUS_COLOR_VAR: Record<string, string> = {
  PENDING: "var(--subtle)",
  GENERATING: "var(--info)",
  GENERATED: "var(--violet)",
  APPROVED: "var(--accent)",
  SENDING: "var(--accent-2)",
  SENT: "var(--success)",
  FAILED: "var(--danger)",
  SKIPPED: "var(--subtle)",
  DRAFT: "var(--subtle)",
  READY_FOR_REVIEW: "var(--violet)",
  SCHEDULED: "var(--accent)",
  RUNNING: "var(--info)",
  COMPLETED: "var(--success)",
  PAUSED: "var(--warning)",
  REJECTED: "var(--danger)",
};
