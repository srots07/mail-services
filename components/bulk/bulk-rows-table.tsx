"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/form";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/client/api";
import type { BulkOverview, BulkRowFilter, BulkRowItem, BulkRowsResponse } from "@/lib/services/bulk";
import { BulkRowDrawer } from "./bulk-row-drawer";

export type BulkTableMode = "contacts" | "review" | "results";

const FILTER_LABELS: Record<BulkRowFilter, string> = {
  all: "All",
  invalid: "Needs fixing",
  ready: "Ready for review",
  approved: "Approved",
  rejected: "Rejected",
  queued: "Scheduled",
  sent: "Sent",
  failed: "Failed",
};

const MODE_FILTERS: Record<BulkTableMode, BulkRowFilter[]> = {
  contacts: ["all"],
  review: ["all", "ready", "invalid", "approved", "rejected"],
  results: ["all", "sent", "failed", "queued", "rejected", "invalid"],
};

export function BulkRowsTable({
  campaignId,
  overview,
  mode,
  initialFilter = "all",
  version,
  onChanged,
  selectionActions,
}: {
  campaignId: string;
  overview: BulkOverview;
  mode: BulkTableMode;
  initialFilter?: BulkRowFilter;
  version: number;
  onChanged: () => void;
  selectionActions?: (ids: string[], clear: () => void) => ReactNode;
}) {
  const [filter, setFilter] = useState<BulkRowFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BulkRowsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<BulkRowItem | null>(null);
  const pageSize = 50;

  const load = useCallback(() => {
    const sp = new URLSearchParams({ filter, page: String(page), pageSize: String(pageSize) });
    if (query) sp.set("search", query);
    setLoading(true);
    return api<BulkRowsResponse>(`/api/campaigns/${campaignId}/bulk/rows?${sp}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(`Could not load the rows${err instanceof Error ? `: ${err.message}` : "."}`))
      .finally(() => setLoading(false));
  }, [campaignId, filter, page, query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, version]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const clear = () => setSelected(new Set());
  const filters = MODE_FILTERS[mode];

  const columns: Column<BulkRowItem>[] = [
    { key: "n", header: "#", cell: (r) => <span className="type-data text-subtle">{r.number}</span>, headerClassName: "w-12" },
    {
      key: "company",
      header: "Company",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">{r.companyName}</p>
          <p className="type-caption truncate text-subtle md:hidden">{r.to ?? "No email"}</p>
        </div>
      ),
    },
    { key: "to", header: "To name", priority: "secondary", cell: (r) => r.customerName },
    { key: "email", header: "Email", priority: "secondary", cell: (r) => <span className="type-data">{r.to ?? <span className="text-danger">Missing</span>}</span> },
    mode === "contacts"
      ? { key: "from", header: "From name", priority: "secondary", cell: (r) => <span className="text-xs">{r.fromName || <span className="text-subtle">Your sender profile</span>}</span> }
      : {
          key: "subject",
          header: "Subject",
          priority: "secondary",
          className: "max-w-[22rem]",
          cell: (r) => (
            <div className="min-w-0 text-xs" title={r.email?.subject}>
              <p className="truncate">{r.email?.subject ?? <span className="text-subtle">Not generated yet</span>}</p>
              {r.problem && <p className="truncate text-danger">{r.problem}</p>}
            </div>
          ),
        },
    ...(mode === "results"
      ? [
          {
            key: "sent",
            header: "Sent / error",
            priority: "secondary" as const,
            className: "max-w-[16rem]",
            cell: (r: BulkRowItem) => (
              <div className="min-w-0 text-xs">
                <p className="type-data truncate text-muted">{r.sentAt ? new Date(r.sentAt).toLocaleString() : r.scheduledAt ? `Scheduled ${new Date(r.scheduledAt).toLocaleString()}` : ""}</p>
                {r.errorMessage && <p className="truncate text-danger">{r.errorMessage}</p>}
              </div>
            ),
          },
        ]
      : []),
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.displayStatus} /> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {filters.length > 1 ? (
          <Tabs
            label="Filter rows"
            value={filter}
            onChange={(f) => {
              setFilter(f);
              setPage(1);
              clear();
            }}
            items={filters.map((f) => ({ key: f, label: FILTER_LABELS[f] }))}
          />
        ) : (
          <span />
        )}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input className="h-9 pl-9" placeholder="Search name, company or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search rows" />
        </div>
      </div>

      {selectionActions && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          {selectionActions([...selected], clear)}
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line">
        <DataTable
          rows={items}
          columns={columns}
          rowKey={(r) => r.id}
          loading={loading && !data}
          error={error}
          onRetry={() => void load()}
          empty={query ? "No rows match your search." : "No rows match this filter."}
          onRowClick={setOpen}
          rowProps={(r) => ({ "data-row-id": r.id })}
          selection={selectionActions ? { selected, onChange: setSelected } : undefined}
          minWidth={0}
          className="md:min-w-[820px]"
          label="Campaign rows"
          testId="bulk-rows"
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span className="type-data">{data ? `${data.total} rows` : error ? "" : "Loading rows"}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {page} / {pages}
          </span>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      {open && (
        <BulkRowDrawer
          campaignId={campaignId}
          row={open}
          overview={overview}
          onClose={() => setOpen(null)}
          onChanged={() => {
            onChanged();
            void load();
          }}
        />
      )}
    </div>
  );
}
