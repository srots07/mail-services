"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  duration: number;
}

export interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const KIND_CONFIG: Record<
  ToastKind,
  {
    icon: typeof Info;
    label: string;
    iconWrap: string;
    iconColor: string;
    glow: string;
    badgeStyle: string;
    progressColor: string;
  }
> = {
  info: {
    icon: Info,
    label: "Info",
    iconWrap: "bg-info/10 text-info border border-info/30 shadow-[0_0_18px_rgba(60,198,238,0.25)]",
    iconColor: "text-info",
    glow: "rgba(60, 198, 238, 0.16)",
    badgeStyle: "bg-info/15 text-info border-info/30",
    progressColor: "bg-gradient-to-r from-info/70 via-info to-info shadow-[0_0_8px_rgba(60,198,238,0.8)]",
  },
  success: {
    icon: CheckCircle2,
    label: "Success",
    iconWrap: "bg-success/10 text-success border border-success/30 shadow-[0_0_18px_rgba(52,211,153,0.25)]",
    iconColor: "text-success",
    glow: "rgba(52, 211, 153, 0.16)",
    badgeStyle: "bg-success/15 text-success border-success/30",
    progressColor: "bg-gradient-to-r from-success/70 via-success to-success shadow-[0_0_8px_rgba(52,211,153,0.8)]",
  },
  warning: {
    icon: AlertCircle,
    label: "Warning",
    iconWrap: "bg-warning/10 text-warning border border-warning/30 shadow-[0_0_18px_rgba(245,181,68,0.25)]",
    iconColor: "text-warning",
    glow: "rgba(245, 181, 68, 0.16)",
    badgeStyle: "bg-warning/15 text-warning border-warning/30",
    progressColor: "bg-gradient-to-r from-warning/70 via-warning to-warning shadow-[0_0_8px_rgba(245,181,68,0.8)]",
  },
  error: {
    icon: AlertTriangle,
    label: "Attention",
    iconWrap: "bg-danger/10 text-danger border border-danger/30 shadow-[0_0_18px_rgba(248,113,113,0.25)]",
    iconColor: "text-danger",
    glow: "rgba(248, 113, 113, 0.16)",
    badgeStyle: "bg-danger/15 text-danger border-danger/30",
    progressColor: "bg-gradient-to-r from-danger/70 via-danger to-danger shadow-[0_0_8px_rgba(248,113,113,0.8)]",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = nextId.current++;
      const duration = kind === "error" ? 8000 : 4500;
      setItems((prev) => [...prev.slice(-3), { id, kind, title, message, duration }]);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, m) => push("success", t, m),
      error: (t, m) => push("error", t, m),
      info: (t, m) => push("info", t, m),
      warning: (t, m) => push("warning", t, m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <aside
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-14 right-4 z-[var(--z-toast)] flex w-[min(410px,calc(100vw-2rem))] flex-col gap-2.5 sm:right-6"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef<number>(0);
  const remainingRef = useRef<number>(item.duration);
  const config = KIND_CONFIG[item.kind];
  const Icon = config.icon;

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(item.id);
    }, 220);
  }, [item.id, onDismiss]);

  useEffect(() => {
    if (isPaused || isExiting) return;

    startTimeRef.current = Date.now();
    const totalRemaining = remainingRef.current;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const currentRemaining = Math.max(0, totalRemaining - elapsed);
      const pct = Math.max(0, (currentRemaining / item.duration) * 100);
      setProgress(pct);

      if (currentRemaining <= 0) {
        clearInterval(interval);
        handleDismiss();
      }
    }, 25);

    return () => {
      clearInterval(interval);
      const elapsed = Date.now() - startTimeRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [isPaused, isExiting, item.duration, handleDismiss]);

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={cn(
        "group pointer-events-auto relative flex w-full flex-col overflow-hidden rounded-2xl",
        "bg-panel/95 backdrop-blur-2xl dark:bg-[#0c121e]/95",
        "border border-line-strong/80",
        "transition-all duration-200 ease-out",
        isExiting
          ? "translate-x-6 scale-95 opacity-0"
          : "translate-x-0 scale-100 opacity-100 animate-toast-in",
      )}
      style={{
        boxShadow: `0 18px 45px -10px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 28px -4px ${config.glow}`,
      }}
    >
      {/* Specular top sheen */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent"
        aria-hidden
      />

      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: config.glow, opacity: 0.6 }}
        aria-hidden
      />

      {/* Main content body */}
      <div className="relative flex items-start gap-3.5 p-3.5 pr-9">
        {/* Glow-backed icon */}
        <div className={cn("relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105", config.iconWrap)}>
          <Icon className={cn("h-4.5 w-4.5", config.iconColor)} strokeWidth={2.2} aria-hidden />
        </div>

        {/* Text area */}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                config.badgeStyle,
              )}
            >
              {config.label}
            </span>
          </div>
          <p className="mt-1 text-[13px] font-semibold tracking-tight text-fg leading-snug">
            {item.title}
          </p>
          {item.message && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted line-clamp-3">
              {item.message}
            </p>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-lg text-subtle/80 transition-all hover:bg-fg/10 hover:text-fg active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {/* Smooth auto-dismiss countdown bar */}
      <div className="h-[2px] w-full overflow-hidden bg-white/[0.04]" aria-hidden>
        <div
          className={cn("h-full transition-all duration-75", config.progressColor)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
