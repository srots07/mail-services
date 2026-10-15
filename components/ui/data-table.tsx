"use client";

import { useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Checkbox } from "./form";
import { Skeleton } from "./skeleton";
import { TableFrame } from "./table";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

export function useSort<T, K extends string>(rows: T[], accessors: Record<K, (row: T) => string | number>, initial: SortState<K> = null) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = accessors[sort.key];
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
    // accessors is a static map supplied by the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  function toggle(key: K) {
    setSort((prev) => (prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null));
  }

  return { sorted, sort, toggle };
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded uppercase tracking-[inherit] transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          active && "text-accent-strong",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3", !active && "opacity-40")} strokeWidth={1.75} aria-hidden />
      </button>
    </th>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  /** Secondary columns are hidden below the md breakpoint; open the row for the full record. */
  priority?: "primary" | "secondary";
  className?: string;
  headerClassName?: string;
}

export interface DataTableSelection {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

/**
 * The one table used across the app: sticky header, optional sorting and selection, density-aware
 * padding (html[data-density]), and loading / empty / error rows built in.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  rowClassName,
  rowProps,
  selection,
  minWidth = 720,
  className,
  frameClassName,
  label,
  testId,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement> & Record<`data-${string}`, string>;
  selection?: DataTableSelection;
  minWidth?: number;
  className?: string;
  frameClassName?: string;
  label?: string;
  testId?: string;
}) {
  const accessors = useMemo(() => Object.fromEntries(columns.filter((c) => c.sortValue).map((c) => [c.key, c.sortValue!])) as Record<string, (row: T) => string | number>, [columns]);
  const { sorted, sort, toggle } = useSort<T, string>(rows, accessors);
  const span = columns.length + (selection ? 1 : 0);
  const keys = sorted.map(rowKey);
  const allSelected = !!selection && keys.length > 0 && keys.every((k) => selection.selected.has(k));
  const hide = (c: Column<T>) => c.priority === "secondary" && "hidden md:table-cell";
  const pad = (i: number, last: boolean) => cn(i === 0 && !selection ? "pl-4 pr-3" : last ? "pl-3 pr-4" : "px-3");

  function toggleAll() {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const k of keys) {
      if (allSelected) next.delete(k);
      else next.add(k);
    }
    selection.onChange(next);
  }

  function toggleOne(k: string) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    selection.onChange(next);
  }

  return (
    <TableFrame className={frameClassName}>
      <table className={cn("data-table w-full text-sm", className)} style={minWidth ? { minWidth } : undefined} aria-label={label} aria-busy={loading || undefined} data-testid={testId}>
        <thead className="text-muted">
          <tr>
            {selection && (
              <th scope="col" className="w-10 pl-4 pr-2 py-2.5">
                <Checkbox aria-label="Select all rows on this page" checked={allSelected} onChange={toggleAll} />
              </th>
            )}
            {columns.map((c, i) =>
              c.sortValue ? (
                <SortHeader key={c.key} label={c.header} sortKey={c.key} sort={sort} onSort={toggle} align={c.align} className={cn("py-2.5 text-left font-medium", pad(i, i === columns.length - 1), hide(c), c.headerClassName)} />
              ) : (
                <th key={c.key} scope="col" className={cn("py-2.5 font-medium", c.align === "right" ? "text-right" : "text-left", pad(i, i === columns.length - 1), hide(c), c.headerClassName)}>
                  {c.header}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {loading && rows.length === 0
            ? Array.from({ length: 5 }, (_, r) => (
                <tr key={`sk-${r}`}>
                  <td colSpan={span} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            : sorted.map((row) => {
                const k = rowKey(row);
                const isSelected = selection?.selected.has(k);
                return (
                  <tr
                    key={k}
                    {...rowProps?.(row)}
                    aria-selected={selection ? isSelected : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn("transition-colors hover:bg-panel-2/70", onRowClick && "cursor-pointer", rowClassName?.(row))}
                  >
                    {selection && (
                      <td className="w-10 pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label="Select row" checked={!!isSelected} onChange={() => toggleOne(k)} />
                      </td>
                    )}
                    {columns.map((c, i) => (
                      <td key={c.key} className={cn("py-3 align-middle", c.align === "right" && "text-right", pad(i, i === columns.length - 1), hide(c), c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          {!loading && error && (
            <tr>
              <td colSpan={span} className="px-4 py-8 text-center">
                <p className="type-body-sm text-danger" role="alert">
                  {error}
                </p>
                {onRetry && (
                  <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
                    <RotateCw aria-hidden />
                    Try again
                  </Button>
                )}
              </td>
            </tr>
          )}
          {!loading && !error && rows.length === 0 && (
            <tr>
              <td colSpan={span} className="px-4 py-10 text-center type-body-sm text-muted">
                {empty ?? "Nothing to show yet."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableFrame>
  );
}
