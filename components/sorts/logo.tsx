import Image from "next/image";
import { cn } from "@/lib/utils";

const MARK_SRC = "/brand/sorts-mark.svg";

/** The Sorts symbol. Rendered from the brand file, never recoloured or distorted. */
export function SortsMark({ size = 28, className, priority }: { size?: number; className?: string; priority?: boolean }) {
  return <Image src={MARK_SRC} width={size} height={size} alt="" aria-hidden unoptimized priority={priority} className={cn("shrink-0 select-none", className)} draggable={false} />;
}

/** Symbol plus the "Sorts" wordmark. `tagline` adds the one-line product descriptor below. */
export function SortsLogo({
  size = 28,
  tagline,
  className,
  wordmarkClassName,
  priority,
}: {
  size?: number;
  tagline?: string;
  className?: string;
  wordmarkClassName?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <SortsMark size={size} priority={priority} />
      <span className="min-w-0 leading-none">
        <span className={cn("type-brand sorts-text block truncate", wordmarkClassName)} style={{ fontSize: Math.round(size * 0.78) }}>
          Sorts
        </span>
        {tagline && <span className="type-hint mt-1 block truncate text-subtle">{tagline}</span>}
      </span>
    </span>
  );
}
