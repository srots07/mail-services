"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/form";
import { SegmentedProgress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { needsAttention } from "@/lib/campaign-status";
import { formatDate } from "@/lib/utils";

export interface CampaignRow {
  id: string;
  campaignName: string;
  status: string;
  totalContacts: number;
  generatedCount: number;
  approvedCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

type Filter = "all" | "attention" | "active" | "done";

const ACTIVE = new Set(["GENERATING", "SCHEDULED", "RUNNING"]);
const DONE = new Set(["COMPLETED"]);

function matches(c: CampaignRow, f: Filter): boolean {
  if (f === "attention") return needsAttention(c);
  if (f === "active") return ACTIVE.has(c.status);
  if (f === "done") return DONE.has(c.status);
  return true;
}

const COLUMNS: Column<CampaignRow>[] = [
  {
    key: "name",
    header: "Campaign",
    sortValue: (r) => r.campaignName.toLowerCase(),
    cell: (c) => (
      <div className="min-w-0">
        <Link href={`/campaigns/${c.id}`} className="font-medium text-fg transition-colors hover:text-accent-strong">
          {c.campaignName}
        </Link>
        <p className="type-caption text-subtle md:hidden">
          {c.sentCount}/{c.totalContacts} sent{c.failedCount ? ` · ${c.failedCount} failed` : ""}
        </p>
      </div>
    ),
  },
  { key: "status", header: "Status", sortValue: (r) => r.status, cell: (c) => <StatusBadge status={c.status} /> },
  {
    key: "progress",
    header: "Progress",
    priority: "secondary",
    headerClassName: "w-44",
    cell: (c) => (
      <SegmentedProgress
        total={Math.max(1, c.totalContacts)}
        segments={[
          { value: c.sentCount, className: "bg-success", label: "Sent" },
          { value: Math.max(0, c.approvedCount - c.sentCount), className: "bg-accent", label: "Approved" },
          { value: Math.max(0, c.generatedCount - c.approvedCount), className: "bg-violet", label: "AI drafted" },
          { value: c.failedCount, className: "bg-danger", label: "Failed" },
        ]}
      />
    ),
  },
  { key: "recipients", header: "Contacts", align: "right", priority: "secondary", sortValue: (r) => r.totalContacts, cell: (c) => <span className="type-data">{c.totalContacts}</span> },
  { key: "generated", header: "AI drafted", align: "right", priority: "secondary", sortValue: (r) => r.generatedCount, cell: (c) => <span className="type-data">{c.generatedCount}</span> },
  { key: "approved", header: "Approved", align: "right", priority: "secondary", sortValue: (r) => r.approvedCount, cell: (c) => <span className="type-data">{c.approvedCount}</span> },
  { key: "sent", header: "Sent", align: "right", priority: "secondary", sortValue: (r) => r.sentCount, cell: (c) => <span className="type-data text-success">{c.sentCount}</span> },
  {
    key: "failed",
    header: "Failed",
    align: "right",
    priority: "secondary",
    sortValue: (r) => r.failedCount,
    cell: (c) => <span className={c.failedCount ? "type-data text-danger" : "type-data text-subtle"}>{c.failedCount}</span>,
  },
  { key: "created", header: "Created", priority: "secondary", sortValue: (r) => new Date(r.createdAt).getTime(), cell: (c) => <span className="type-data text-muted">{formatDate(c.createdAt)}</span> },
  {
    key: "open",
    header: <span className="sr-only">Open</span>,
    align: "right",
    cell: (c) => (
      <Link
        href={`/campaigns/${c.id}`}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent-strong transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        aria-label={`Continue ${c.campaignName}`}
      >
        {c.status === "COMPLETED" ? "Results" : "Continue"}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    ),
  },
];

export function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const counts = useMemo(
    () => ({
      all: rows.length,
      attention: rows.filter((r) => matches(r, "attention")).length,
      active: rows.filter((r) => matches(r, "active")).length,
      done: rows.filter((r) => matches(r, "done")).length,
    }),
    [rows],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => matches(r, filter) && (!q || r.campaignName.toLowerCase().includes(q)));
  }, [rows, filter, search]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <Tabs
          label="Filter campaigns"
          value={filter}
          onChange={setFilter}
          items={[
            { key: "all", label: "All", count: counts.all },
            { key: "attention", label: "Needs attention", count: counts.attention },
            { key: "active", label: "In progress", count: counts.active },
            { key: "done", label: "Completed", count: counts.done },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input className="h-9 pl-9" placeholder="Search campaigns" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search campaigns" />
        </div>
      </div>
      <DataTable
        rows={visible}
        columns={COLUMNS}
        rowKey={(r) => r.id}
        minWidth={0}
        className="md:min-w-[880px]"
        label="Campaigns"
        empty={search || filter !== "all" ? "No campaigns match this filter." : "No campaigns yet."}
      />
    </div>
  );
}
