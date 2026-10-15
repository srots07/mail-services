import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PipelineTone = "neutral" | "violet" | "accent" | "success" | "danger";

export interface PipelineStage {
  key: string;
  label: string;
  value: number;
  hint?: ReactNode;
  tone: PipelineTone;
  /** Share of the first stage, 0-1. Drawn as the stage's fill bar. */
  share?: number;
}

const TEXT: Record<PipelineTone, string> = {
  neutral: "text-fg",
  violet: "text-violet",
  accent: "text-accent-strong",
  success: "text-success",
  danger: "text-danger",
};

const FILL: Record<PipelineTone, string> = {
  neutral: "bg-muted",
  violet: "bg-violet",
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
};

/**
 * The Sorts pipeline: stages read left to right, joined by the mark's 45 degree switchback, so
 * contacts visibly travel up and forward to sent.
 */
export function Pipeline({ stages, label, className }: { stages: PipelineStage[]; label: string; className?: string }) {
  return (
    <ol
      aria-label={label}
      className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:grid-cols-3 lg:gap-0 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none", className)}
    >
      {stages.map((stage, index) => (
        <li key={stage.key} className="sorts-surface relative p-4 lg:pl-6">
          {index > 0 && (
            <span aria-hidden className="absolute inset-y-0 left-0 z-[1] hidden w-3 -translate-x-1/2 lg:block">
              <svg viewBox="0 0 12 48" preserveAspectRatio="none" className="h-full w-full">
                <path d="M2 46 L10 24 L2 2" fill="none" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </svg>
            </span>
          )}
          <p className="type-mono-label text-muted">{stage.label}</p>
          <p className={cn("type-kpi mt-2.5", TEXT[stage.tone])}>{stage.value.toLocaleString()}</p>
          {stage.hint && <p className="type-caption mt-1.5 text-subtle">{stage.hint}</p>}
          {typeof stage.share === "number" && (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-panel-3" aria-hidden>
              <div className={cn("h-full rounded-full transition-[width] duration-500", FILL[stage.tone])} style={{ width: `${Math.round(Math.min(1, Math.max(0, stage.share)) * 100)}%` }} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
