"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { Badge, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { TableSkeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";
import { cn, formatDateTime } from "@/lib/utils";

interface ActivityItem {
  id: string;
  category: string;
  level: string;
  message: string;
  createdAt: string;
}
interface AiItem {
  id: string;
  status: string;
  model: string;
  promptVersion: number;
  attempt: number;
  httpStatus: number | null;
  errorMessage: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  prompt: string;
  recipient: string | null;
  generatedAt: string;
}
interface SendItem {
  id: string;
  kind: string;
  status: string;
  provider: string;
  toEmail: string;
  subject: string;
  attempt: number;
  errorMessage: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
}

const LEVEL_TONE: Record<string, BadgeTone> = { INFO: "neutral", WARN: "warning", ERROR: "danger" };

export function LogsPanel({ campaignId }: { campaignId: string }) {
  const [type, setType] = useState<"activity" | "ai" | "sends">("activity");
  const [items, setItems] = useState<unknown[] | null>(null);
  const [promptView, setPromptView] = useState<AiItem | null>(null);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ items: unknown[] }>(`/api/campaigns/${campaignId}/logs?type=${type}&limit=300`)
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "The log service did not respond.");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, type, nonce]);

  const reload = useCallback(() => {
    setItems(null);
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <Tabs
          label="Log type"
          value={type}
          onChange={(k) => {
            if (k === type) return;
            setItems(null);
            setError(null);
            setType(k);
          }}
          items={[
            { key: "activity", label: "Activity" },
            { key: "ai", label: "AI generation" },
            { key: "sends", label: "Email sends" },
          ]}
        />
        <Button size="sm" variant="ghost" onClick={reload}>
          <RotateCw aria-hidden />
          Refresh
        </Button>
      </div>
      {items === null && !error ? (
        <TableSkeleton />
      ) : error ? (
        <div className="p-4">
          <ErrorState title="Could not load the log" description={error} action={<Button size="sm" onClick={reload}>Try again</Button>} />
        </div>
      ) : items!.length === 0 ? (
        <div className="p-4">
          <EmptyState compact title="No log entries yet" description="Generation and sending activity appears here once work starts." />
        </div>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          {type === "activity" && (
            <ul className="divide-y divide-line">
              {(items as ActivityItem[]).map((l) => (
                <li key={l.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="type-data w-32 shrink-0 text-subtle">{formatDateTime(l.createdAt)}</span>
                  <Badge tone={LEVEL_TONE[l.level] ?? "neutral"}>{l.category.replace(/_/g, " ").toLowerCase()}</Badge>
                  <span className={cn("min-w-[min(100%,16rem)] flex-1 break-words", l.level === "ERROR" ? "text-danger" : l.level === "WARN" ? "text-warning" : "text-fg")}>{l.message}</span>
                </li>
              ))}
            </ul>
          )}
          {type === "ai" && (
            <DataTable
              rows={items as AiItem[]}
              rowKey={(l) => l.id}
              minWidth={820}
              label="AI generation log"
              columns={[
                { key: "time", header: "Time", cell: (l) => <span className="type-data text-subtle">{formatDateTime(l.generatedAt)}</span> },
                { key: "recipient", header: "Recipient", cell: (l) => <span className="type-data">{l.recipient ?? "-"}</span> },
                {
                  key: "result",
                  header: "Result",
                  cell: (l) => (
                    <Badge tone={l.status === "SUCCESS" ? "success" : l.status === "RETRY" ? "warning" : "danger"}>
                      {l.status.toLowerCase()} · try {l.attempt}
                    </Badge>
                  ),
                },
                { key: "model", header: "Model / prompt", cell: (l) => <span className="text-xs text-muted">{l.model} · v{l.promptVersion}</span> },
                { key: "latency", header: "Latency", align: "right", cell: (l) => <span className="type-data text-muted">{l.latencyMs ? `${(l.latencyMs / 1000).toFixed(1)}s` : "-"}</span> },
                { key: "tokens", header: "Tokens", align: "right", cell: (l) => <span className="type-data text-muted">{l.promptTokens ? `${l.promptTokens}/${l.completionTokens ?? 0}` : "-"}</span> },
                { key: "error", header: "Error", className: "max-w-xs", cell: (l) => <span className="text-xs text-danger">{l.errorMessage ?? ""}</span> },
                {
                  key: "prompt",
                  header: <span className="sr-only">Prompt</span>,
                  align: "right",
                  cell: (l) => (
                    <Button size="xs" variant="tertiary" onClick={() => setPromptView(l)}>
                      View prompt
                    </Button>
                  ),
                },
              ]}
            />
          )}
          {type === "sends" && (
            <DataTable
              rows={items as SendItem[]}
              rowKey={(s) => s.id}
              minWidth={820}
              label="Email send log"
              columns={[
                { key: "time", header: "Time", cell: (s) => <span className="type-data text-subtle">{formatDateTime(s.sentAt ?? s.createdAt)}</span> },
                {
                  key: "type",
                  header: "Type",
                  cell: (s) => (
                    <span className="inline-flex gap-1">
                      <Badge tone={s.kind === "TEST" ? "info" : "neutral"}>{s.kind === "TEST" ? "Test" : "Campaign"}</Badge>
                      {s.provider === "MOCK" && <Badge tone="warning">Test mode</Badge>}
                    </span>
                  ),
                },
                { key: "to", header: "To", cell: (s) => <span className="type-data">{s.toEmail}</span> },
                { key: "subject", header: "Subject", className: "max-w-xs truncate", cell: (s) => <span className="text-xs">{s.subject}</span> },
                { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
                {
                  key: "details",
                  header: "Details",
                  className: "max-w-xs",
                  cell: (s) => (
                    <span className="text-xs text-muted">
                      {s.errorMessage ? <span className="text-danger">{s.errorMessage}</span> : s.providerMessageId ? `Message id ${s.providerMessageId}` : ""}
                      {s.attempt > 1 ? ` (attempt ${s.attempt})` : ""}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </div>
      )}
      <Modal open={!!promptView} onClose={() => setPromptView(null)} title="Prompt used" description={promptView ? `${promptView.model} · prompt v${promptView.promptVersion}` : undefined} size="lg">
        <pre className="whitespace-pre-wrap type-data leading-relaxed text-muted">{promptView?.prompt}</pre>
      </Modal>
    </Card>
  );
}
