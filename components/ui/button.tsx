import type { ButtonHTMLAttributes, ComponentProps } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "danger" | "success";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

/**
 * primary: the one main action per view. secondary: alternatives. tertiary: low-emphasis inline
 * actions (text-like). outline: neutral bordered. ghost: toolbar/icon actions. danger / success: outcomes.
 */
const variants: Record<Variant, string> = {
  primary: "sorts-action font-semibold shadow-card hover:brightness-110 hover:shadow-glow-soft focus-visible:shadow-glow",
  secondary: "bg-panel-3 text-fg border border-line-strong hover:border-accent/45 hover:bg-panel-2",
  tertiary: "bg-transparent text-accent-strong hover:bg-accent-soft",
  outline: "border border-line-strong bg-transparent text-fg hover:border-accent/40 hover:bg-panel-2",
  ghost: "text-muted hover:text-fg hover:bg-panel-2",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/15",
  success: "bg-success-soft text-success border border-success/30 hover:bg-success/15",
};

const sizes: Record<Size, string> = {
  xs: "h-7 px-2 text-xs gap-1 [&_svg]:h-3.5 [&_svg]:w-3.5",
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-10 w-10 p-0",
  "icon-sm": "h-8 w-8 p-0",
};

export function buttonClasses({ variant = "secondary", size = "md", mono, className }: { variant?: Variant; size?: Size; mono?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
    "transition-[transform,background-color,border-color,color,box-shadow,filter] duration-150 ease-out motion-reduce:transition-none motion-reduce:transform-none",
    "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-50 disabled:transform-none aria-disabled:pointer-events-none aria-disabled:opacity-50",
    mono && "font-mono uppercase tracking-wider",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  mono?: boolean;
}

export function Button({ variant = "secondary", size = "md", loading, mono, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClasses({ variant, size, mono, className })}>
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/** A link that looks like a button: use for navigation instead of wrapping <Button> in <Link>. */
export function ButtonLink({ variant = "secondary", size = "md", mono, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; mono?: boolean }) {
  return <Link {...rest} className={buttonClasses({ variant, size, mono, className })} />;
}
