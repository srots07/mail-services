"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  count?: number;
}

/** Segmented tabs with a sliding indicator and arrow-key navigation (WAI-ARIA tabs pattern). */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  className,
  idBase,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
  /** Tab ids become `${idBase}-tab-${key}` so panels can reference them. */
  idBase?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-key="${value}"]`);
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = items.findIndex((t) => t.key === value);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = items[(next + items.length) % items.length];
    onChange(target.key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-key="${target.key}"]`)?.focus();
  }

  return (
    <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn("relative inline-flex max-w-full overflow-x-auto rounded-lg border border-line-strong bg-panel-2 p-0.5", className)}>
      {indicator && (
        <span aria-hidden className="tab-indicator absolute top-0.5 bottom-0.5 overflow-hidden rounded-md bg-panel-3 shadow-card" style={{ left: indicator.left, width: indicator.width }}>
          <span className="absolute inset-x-2 bottom-0 h-px bg-[image:var(--sorts-gradient-line)]" />
        </span>
      )}
      {items.map((t) => {
        const selected = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={idBase ? `${idBase}-tab-${t.key}` : undefined}
            data-key={t.key}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative z-[1] inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              selected ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cn("type-data rounded px-1", selected ? "bg-accent-soft text-accent-strong" : "text-subtle")}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
