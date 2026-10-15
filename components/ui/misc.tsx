import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export { EmptyState, ErrorState, LoadingState } from "./states";

/**
 * Page context in the first viewport: eyebrow (where am I), title, one-line purpose, status, the
 * primary action and supporting metadata. Keep descriptions to one sentence.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  status,
  meta,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-[min(100%,20rem)] flex-1">
        {eyebrow && (
          <div className="type-mono-label mb-2 flex items-center gap-2 text-accent-strong">
            <span aria-hidden className="h-px w-4 bg-[image:var(--sorts-gradient-line)]" />
            {eyebrow}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="type-h1 min-w-0 break-words text-fg">{title}</h1>
          {status}
        </div>
        {description && <p className="type-body mt-1.5 max-w-2xl text-muted">{description}</p>}
        {meta && <div className="type-caption mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-subtle">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Alert({ tone = "info", title, children, action }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const styles = {
    info: "border-info/30 bg-info-soft text-info",
    warning: "border-warning/30 bg-warning-soft text-warning",
    danger: "border-danger/30 bg-danger-soft text-danger",
    success: "border-success/30 bg-success-soft text-success",
  }[tone];
  return (
    <div className={cn("flex flex-wrap gap-3 rounded-md border px-4 py-3 text-sm", styles)} role={tone === "danger" ? "alert" : "status"}>
      <span className="led mt-1.5" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={cn("type-body-sm text-muted", title ? "mt-1" : null)}>{children}</div>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <code className="type-data rounded border border-line-strong bg-panel-3 px-1.5 py-0.5 text-accent-strong">{children}</code>;
}
