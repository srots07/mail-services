import { cn } from "@/lib/utils";

/**
 * The Sorts flow line: progress that travels violet to cyan. Pass `value` (0-1) for determinate
 * progress; omit it for work whose length is unknown.
 */
export function SortsFlowLine({ value, label, className, thickness = 3 }: { value?: number; label: string; className?: string; thickness?: number }) {
  const determinate = typeof value === "number";
  const pct = determinate ? Math.round(Math.min(1, Math.max(0, value)) * 100) : undefined;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={pct}
      className={cn("sorts-flow w-full rounded-full", !determinate && "sorts-flow-indeterminate", className)}
      style={{ height: thickness }}
    >
      {determinate && <div className="sorts-flow-fill rounded-full" style={{ width: `${pct}%` }} />}
    </div>
  );
}
