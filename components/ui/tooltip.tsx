import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Visual-only label; the wrapped control must carry its own accessible name. */
export function Tooltip({
  label,
  children,
  side = "top",
  disabled,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom";
  disabled?: boolean;
  className?: string;
}) {
  if (disabled) return <>{children}</>;
  const position = {
    top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    right: "left-full top-1/2 ml-3 -translate-y-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  }[side];
  return (
    <span className={cn("group/tip relative block", className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-[var(--z-overlay)] whitespace-nowrap rounded border border-line-strong bg-panel-3 px-2 py-1 type-badge uppercase text-fg opacity-0 shadow-lift transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          position,
        )}
      >
        {label}
      </span>
    </span>
  );
}
