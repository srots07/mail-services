"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Tiny trend line for KPI cards. Decorative: the KPI value carries the meaning. */
export function Sparkline({ values, color = "var(--accent)", className }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const w = 100;
  const h = 28;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * (h - 2) - 1).toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-7 w-full", className)} aria-hidden>
      <polyline points={`0,${h} ${points} ${w},${h}`} fill={color} fillOpacity={0.08} stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface BarDatum {
  label: string;
  /** Stacked values, drawn bottom to top in the order of `series`. */
  values: number[];
}

/**
 * Stacked bar chart in plain SVG (no chart library). Theme-aware through CSS variables, with a
 * y-axis, gridlines, legend, hover/focus tooltip and a table alternative for screen readers.
 */
export function BarSeries({
  data,
  series,
  height = 180,
  empty = "No data for this period yet.",
  label,
}: {
  data: BarDatum[];
  series: { name: string; color: string }[];
  height?: number;
  empty?: string;
  label: string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(...totals, 0);

  if (max === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-line-strong type-body-sm text-muted" style={{ height }}>
        {empty}
      </div>
    );
  }

  const nice = niceMax(max);
  const ticks = [0, nice / 2, nice];
  const chartH = height - 24;
  const barW = 100 / data.length;

  return (
    <figure aria-labelledby={`${id}-cap`} className="relative">
      <figcaption id={`${id}-cap`} className="sr-only">
        {label}
      </figcaption>
      <div className="flex gap-2">
        <div className="type-data relative w-8 shrink-0 text-right text-subtle" style={{ height: chartH }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / nice) * 100}%` }}>
              {formatTick(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg viewBox={`0 0 100 ${chartH}`} preserveAspectRatio="none" className="block w-full" style={{ height: chartH }} aria-hidden>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={100} y1={(1 - t / nice) * chartH} y2={(1 - t / nice) * chartH} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {data.map((d, i) => {
              let y = chartH;
              return (
                <g key={d.label} opacity={active === null || active === i ? 1 : 0.45}>
                  {d.values.map((v, s) => {
                    const hgt = (v / nice) * chartH;
                    y -= hgt;
                    return v > 0 ? <rect key={s} x={i * barW + barW * 0.18} width={barW * 0.64} y={y} height={hgt} fill={series[s]?.color} rx={0.6} className="grow-bar" /> : null;
                  })}
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <button
                key={d.label}
                type="button"
                className="h-full flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                aria-label={`${d.label}: ${series.map((s, k) => `${d.values[k] ?? 0} ${s.name.toLowerCase()}`).join(", ")}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            ))}
          </div>
          {active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line-strong bg-panel-3 px-2.5 py-1.5 shadow-lift"
              style={{ left: `${(active + 0.5) * barW}%` }}
            >
              <p className="type-badge text-fg">{data[active].label}</p>
              {series.map((s, k) => (
                <p key={s.name} className="type-data flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                  {s.name} <span className="text-fg">{data[active].values[k] ?? 0}</span>
                </p>
              ))}
            </div>
          )}
          <div className="type-data mt-1.5 flex text-subtle" aria-hidden>
            {data.map((d, i) => (
              <span key={d.label} className="flex-1 truncate text-center">
                {i % Math.ceil(data.length / 7) === 0 ? d.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 pl-10" aria-hidden>
        {series.map((s) => (
          <span key={s.name} className="type-caption inline-flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </figure>
  );
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function formatTick(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(Math.round(v));
}
