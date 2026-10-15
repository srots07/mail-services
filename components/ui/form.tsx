import { cloneElement, forwardRef, isValidElement, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-md border border-line-strong bg-panel-2 px-3 text-sm text-fg placeholder:text-subtle " +
  "transition-[border-color,box-shadow] focus:outline-none focus:border-accent focus:shadow-glow " +
  "disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/20";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cn(fieldBase, "h-10", className)} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} {...rest} className={cn(fieldBase, "py-2.5 leading-relaxed", className)} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cn(fieldBase, "h-10 appearance-none pr-9", className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} aria-hidden />
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  success,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  success?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  const control =
    isValidElement(children)
      ? cloneElement(children as ReactElement<{ className?: string; id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>, {
          id: (children.props as { id?: string }).id ?? htmlFor,
          "aria-invalid": error ? true : undefined,
          className: cn((children.props as { className?: string }).className, error && "border-danger focus:border-danger focus:ring-danger/20"),
        })
      : children;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="type-mono-label block text-muted">
        {label}
      </label>
      {control}
      {error ? (
        <p className="type-caption text-danger">{error}</p>
      ) : success ? (
        <p className="type-caption text-success">{success}</p>
      ) : hint ? (
        <p className="type-caption text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      {...rest}
      className={cn("h-4 w-4 cursor-pointer rounded border-line-strong bg-panel-2", className)}
      style={{ accentColor: "var(--accent)" }}
    />
  );
}
