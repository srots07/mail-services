"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeChoice } from "./theme-provider";

const OPTIONS: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { choice, setTheme, ready } = useTheme();
  const current = OPTIONS.findIndex((o) => o.id === choice);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = OPTIONS[(Math.max(0, current) + delta + OPTIONS.length) % OPTIONS.length];
    setTheme(next.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-theme-option="${next.id}"]`)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Color theme" onKeyDown={onKeyDown} className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
      {OPTIONS.map((option, i) => {
        const active = ready && choice === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            data-theme-option={option.id}
            tabIndex={active || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => setTheme(option.id)}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs transition-colors motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              active ? "bg-panel text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {!compact && <span className="hidden xl:inline">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
