import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { SortsAmbient } from "@/components/sorts/ambient";
import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

/** Answers "why is this empty?" and "what can I do?". Use `scene` only for page-level empties. */
export function EmptyState({
  title,
  description,
  action,
  className,
  icon,
  scene,
  compact,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
  scene?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-strong px-6 text-center",
        scene ? "min-h-80 py-16" : compact ? "py-8" : "py-12",
        className,
      )}
    >
      {scene && <SortsAmbient fade="radial" />}
      <div className="relative flex flex-col items-center">
        <div className="sorts-cut mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-line-strong bg-panel-2 text-accent-strong">
          {icon ?? <Inbox className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        </div>
        <p className="type-h4 text-fg">{title}</p>
        {description && <p className="type-caption mt-1 max-w-md text-muted">{description}</p>}
        {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

/** A designed failure: what went wrong, how to recover, and optional technical detail. */
export function ErrorState({
  title = "This couldn't be loaded",
  description,
  action,
  details,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  details?: string | null;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("rounded-lg border border-danger/30 bg-danger-soft px-5 py-5", className)}>
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="type-h4 text-fg">{title}</p>
          {description && <div className="type-body-sm mt-1 text-muted">{description}</div>}
          {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
          {details && (
            <details className="mt-3">
              <summary className="type-caption cursor-pointer text-subtle">Technical details</summary>
              <pre className="type-technical mt-2 whitespace-pre-wrap break-words text-subtle">{details}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

/** Skeletons shaped like the content that is loading, plus a short message for screen readers. */
export function LoadingState({ variant = "table", message = "Loading", className }: { variant?: "page" | "table" | "form" | "kpis"; message?: string; className?: string }) {
  return (
    <div className={cn("space-y-4", className)} aria-busy="true" role="status" aria-label={message}>
      <span className="sr-only">{message}</span>
      {variant === "page" && (
        <>
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <KpiSkeletons />
          <Skeleton className="h-64 w-full rounded-lg" />
        </>
      )}
      {variant === "kpis" && <KpiSkeletons />}
      {variant === "table" && (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      )}
      {variant === "form" && (
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiSkeletons() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}
