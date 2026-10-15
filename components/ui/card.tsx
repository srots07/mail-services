"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./chart";

type CardVariant = "surface" | "brand" | "chart" | "info" | "action" | "alert";

/**
 * surface: default grouped content. brand: a Sorts moment (hero, next step) with the gradient edge and
 * ascent cut; at most one per view. chart: flat panel for visualisations. info: quiet secondary
 * content. action: clickable, lifts on hover. alert: needs attention.
 */
const cardVariants: Record<CardVariant, string> = {
  surface: "sorts-surface rounded-lg border border-line shadow-card",
  brand: "sorts-surface sorts-edge sorts-cut sorts-cut-accent overflow-hidden rounded-lg border border-line shadow-card",
  chart: "rounded-lg border border-line bg-panel shadow-card",
  info: "rounded-lg border border-line bg-panel-2/60",
  action: "sorts-surface lift rounded-lg border border-line shadow-card hover:border-accent/40",
  alert: "rounded-lg border border-warning/30 bg-warning-soft",
};

export function Card({ variant = "surface", className, ...rest }: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return <div {...rest} className={cn(cardVariants[variant], className)} />;
}

export type LedTone = "accent" | "success" | "warning" | "danger" | "info" | "idle";

const ledTones: Record<LedTone, string> = {
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  idle: "text-subtle",
};

export function Led({ tone = "accent", live = false, className }: { tone?: LedTone; live?: boolean; className?: string }) {
  return <span aria-hidden className={cn("led", live && "led-live", ledTones[tone], className)} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  code,
  status,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  code?: string;
  status?: { tone: LedTone; label: string; live?: boolean };
}) {
  return (
    <div className={cn("relative z-[1] flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        {(code || status) && (
          <div className="type-mono-label mb-1.5 flex items-center gap-2 text-subtle">
            {code && <span>{code}</span>}
            {status && (
              <span className={cn("inline-flex items-center gap-1.5", ledTones[status.tone])}>
                <Led tone={status.tone} live={status.live} />
                {status.label}
              </span>
            )}
          </div>
        )}
        <h3 className="type-h3 text-fg">{title}</h3>
        {description && <p className="type-caption mt-1 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("relative z-[1] p-5", className)} />;
}

/** violet marks AI-generated work everywhere in Sorts. */
export type KpiTone = "default" | "accent" | "violet" | "success" | "danger" | "warning";

const KPI_TEXT: Record<KpiTone, string> = {
  default: "text-fg",
  accent: "text-accent-strong",
  violet: "text-violet",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
};

const KPI_VAR: Record<KpiTone, string> = {
  default: "var(--muted)",
  accent: "var(--accent)",
  violet: "var(--violet)",
  success: "var(--success)",
  danger: "var(--danger)",
  warning: "var(--warning)",
};

/** One key number. Tone colours the value only when it needs attention; most KPIs stay neutral. */
export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  unit,
  series,
  live,
  compact,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: KpiTone;
  unit?: string;
  series?: number[];
  live?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("sorts-surface lift rounded-lg border border-line shadow-card", compact ? "px-3.5 py-3" : "p-4")}>
      <p className="type-mono-label flex items-center gap-1.5 text-muted">
        {live && <Led tone="info" live />}
        {label}
      </p>
      <p className={cn("type-kpi", compact ? "mt-1.5" : "mt-2.5", KPI_TEXT[tone])}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal tracking-normal text-subtle">{unit}</span>}
      </p>
      {hint && <p className="type-caption mt-1.5 text-subtle">{hint}</p>}
      {series && <Sparkline values={series} color={KPI_VAR[tone]} className="mt-3" />}
    </div>
  );
}
