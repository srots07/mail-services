import { cn } from "@/lib/utils";

/**
 * Static brand atmosphere: violet rising from the lower left, cyan at the upper right, over a faint
 * grid. Decorative only; keep it out of dense data views.
 */
export function SortsAmbient({ className, grid = true, fade = "bottom" }: { className?: string; grid?: boolean; fade?: "bottom" | "radial" | "none" }) {
  const mask =
    fade === "bottom"
      ? "[mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      : fade === "radial"
        ? "[mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        : undefined;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="sorts-atmosphere absolute inset-0" />
      {grid && <div className={cn("sorts-grid absolute inset-0", mask)} />}
    </div>
  );
}
