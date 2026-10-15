import { cn } from "@/lib/utils";

export interface ProgressSegment {
  value: number;
  className: string;
  label?: string;
}

export function ProgressBar({ value, max, className, barClassName }: { value: number; max: number; className?: string; barClassName?: string }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-panel-3", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", barClassName ?? "sorts-flow-fill")} style={{ width: `${p}%` }} />
    </div>
  );
}

export function SegmentedProgress({ segments, total, className }: { segments: ProgressSegment[]; total: number; className?: string }) {
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-panel-3", className)}>
      {segments.map((s, i) =>
        s.value > 0 ? (
          <div
            key={i}
            title={s.label ? `${s.label}: ${s.value}` : undefined}
            className={cn("h-full transition-all duration-500", s.className)}
            style={{ width: `${total > 0 ? (s.value / total) * 100 : 0}%` }}
          />
        ) : null,
      )}
    </div>
  );
}
