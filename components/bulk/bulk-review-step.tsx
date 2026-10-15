"use client";

import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, KpiCard } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { bulkStepCode, bulkStepHref } from "@/lib/bulk/steps";
import { api } from "@/lib/client/api";
import { BulkRowsTable } from "./bulk-rows-table";
import type { StepProps } from "./bulk-wizard";

export function BulkReviewStep({ campaignId, overview, version, refresh }: StepProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const c = overview.counts;
  const locked = ["SCHEDULED", "RUNNING", "COMPLETED"].includes(overview.campaign.status);

  async function run(name: string, fn: () => Promise<string>) {
    setBusy(name);
    try {
      toast.success(await fn());
      await refresh();
    } catch (err) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const approve = (ids?: string[]) =>
    run(ids ? "approve-sel" : "approve-all", async () => {
      const r = await api<{ approved: number }>(`/api/campaigns/${campaignId}/recipients/approve`, { body: ids ? { ids } : { all: true } });
      return `Approved ${r.approved} emails (nothing is sent yet)`;
    });

  return (
    <Card>
      <CardHeader
        code={bulkStepCode("review")}
        title="Review emails"
        description="Open any row to see exactly what will be sent: from, to, CC, subject and body. Approving does not send anything; sending only starts in the next step."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={c.pendingReview > 0 ? "primary" : "secondary"}
              loading={busy === "approve-all"}
              disabled={locked || c.pendingReview === 0}
              onClick={() => void approve()}
              data-testid="bulk-approve-all"
            >
              <Check aria-hidden />
              Approve all valid
            </Button>
            {c.generated === 0 ? (
              <Button disabled>Continue to send</Button>
            ) : (
              <ButtonLink href={bulkStepHref(campaignId, "send")} variant={c.pendingReview > 0 ? "secondary" : "primary"}>
                Continue to send
                <ArrowRight aria-hidden />
              </ButtonLink>
            )}
          </div>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <KpiCard label="AI drafted" value={c.generated} tone="violet" compact />
          <KpiCard label="Needs review" value={c.pendingReview} tone="accent" compact />
          <KpiCard label="Approved" value={c.approved} tone="success" compact />
          <KpiCard label="Needs fixing" value={c.blocked} tone={c.blocked ? "danger" : "default"} compact />
          <KpiCard label="Rejected" value={c.rejected} compact />
        </div>
        {overview.campaign.ccEmails.length > 0 && <p className="type-hint text-muted">CC on every email: {overview.campaign.ccEmails.join(", ")}</p>}
        {c.generated === 0 && (
          <Alert
            tone="info"
            action={
              <ButtonLink href={bulkStepHref(campaignId, "generate")} size="sm" variant="secondary">
                Go to Generate
              </ButtonLink>
            }
          >
            No emails generated yet.
          </Alert>
        )}
        {c.queued > 0 && <Alert tone="info">{c.queued} emails are still being generated. This page refreshes automatically.</Alert>}
        <BulkRowsTable
          campaignId={campaignId}
          overview={overview}
          mode="review"
          version={version}
          onChanged={() => void refresh()}
          selectionActions={
            locked
              ? undefined
              : (ids, clear) => (
                  <>
                    <Button size="sm" variant="primary" loading={busy === "approve-sel"} onClick={() => void approve(ids).then(clear)}>
                      Approve selected
                    </Button>
                    <Button
                      size="sm"
                      loading={busy === "regen"}
                      onClick={() =>
                        void run("regen", async () => {
                          const r = await api<{ queued: number }>(`/api/campaigns/${campaignId}/bulk/generate`, { body: { mode: "selected", ids } });
                          clear();
                          return `${r.queued} emails queued for regeneration`;
                        })
                      }
                    >
                      Regenerate selected
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy === "reject"}
                      onClick={() =>
                        void run("reject", async () => {
                          const r = await api<{ rejected: number }>(`/api/campaigns/${campaignId}/recipients/reject`, { body: { ids } });
                          clear();
                          return `Rejected ${r.rejected} emails`;
                        })
                      }
                    >
                      Reject selected
                    </Button>
                  </>
                )
          }
        />
      </CardBody>
    </Card>
  );
}
