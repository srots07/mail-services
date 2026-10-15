import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Scroll container for wide tables: horizontal scroll with a fade hint on small screens. */
export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("table-scroll overflow-auto", className)}>{children}</div>;
}
