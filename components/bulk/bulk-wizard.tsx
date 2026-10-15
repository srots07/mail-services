"use client";

import { ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, KpiCard } from "@/components/ui/card";
import { Alert, ErrorState, LoadingState } from "@/components/ui/misc";
import { SortsFlowLine } from "@/components/sorts/flow-line";
import { useToast } from "@/components/ui/toast";
import { bulkStepCode, bulkStepHref, nextBulkStep, type BulkStepSlug } from "@/lib/bulk/steps";
import { api } from "@/lib/client/api";
import type { BulkOverview } from "@/lib/services/bulk";
import { BulkResultsStep, BulkSendStep } from "./bulk-send-step";
import { BulkReviewStep } from "./bulk-review-step";
import { BulkRowsTable } from "./bulk-rows-table";
import { BulkSenderStep } from "./bulk-sender-step";
import { BulkTemplateStep } from "./bulk-template-step";
import { useBulkOverview } from "./use-bulk";

export interface StepProps {
  campaignId: string;
  overview: BulkOverview;
  version: number;
  refresh: () => Promise<BulkOverview | null>;
}

export function NextStep({ campaignId, step, label, disabled }: { campaignId: string; step: BulkStepSlug; label?: string; disabled?: boolean }) {
  const next = nextBulkStep(step);
  if (!next) return null;
  const content = (
    <>
      {label ?? "Continue"}
      <ArrowRight aria-hidden />
    </>
  );
  if (disabled)
    return (
      <Button variant="primary" disabled>
        {content}
      </Button>
    );
  return (
    <ButtonLink href={bulkStepHref(campaignId, next)} variant="primary">
      {content}
    </ButtonLink>
  );
}

export function BulkWizard({ campaignId, step }: { campaignId: string; step: BulkStepSlug }) {
  const { overview, error, refresh, version } = useBulkOverview(campaignId);
  if (error && !overview)
    return (
      <ErrorState
        title="Sorts couldn't load this campaign"
        description={<>{error} Your campaign data is safe; reload to try again.</>}
        action={
          <Button variant="primary" onClick={() => void refresh()}>
            Try again
          </Button>
        }
      />
    );
  if (!overview) return <LoadingState variant="table" message="Loading campaign" />;
  const props: StepProps = { campaignId, overview, version, refresh };
  const steps: Record<BulkStepSlug, ReactNode> = {
    contacts: <ContactsStep {...props} />,
    template: <BulkTemplateStep {...props} />,
    sender: <BulkSenderStep {...props} />,
    generate: <GenerateStep {...props} />,
    review: <BulkReviewStep {...props} />,
    send: <BulkSendStep {...props} />,
    results: <BulkResultsStep {...props} />,
  };
  return <div className="space-y-5">{steps[step]}</div>;
}

function ContactsStep({ campaignId, overview, version, refresh }: StepProps) {
  const c = overview.counts;
  return (
    <Card>
      <CardHeader
        code={bulkStepCode("contacts")}
        title="Contacts"
        description="Every valid row from your file. Rows without a usable email address were skipped during upload."
        actions={<NextStep campaignId={campaignId} step="contacts" label="Continue to email body" />}
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
          <KpiCard label="Contacts" value={c.total} compact />
          <KpiCard label="AI drafted" value={c.generated} tone={c.generated ? "violet" : "default"} compact />
          <KpiCard label="Sent" value={c.sent} tone={c.sent ? "success" : "default"} compact />
        </div>
        <BulkRowsTable campaignId={campaignId} overview={overview} mode="contacts" version={version} onChanged={() => void refresh()} />
      </CardBody>
    </Card>
  );
}

function GenerateStep({ campaignId, overview, refresh }: StepProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const c = overview.counts;
  const camp = overview.campaign;
  const problems = [
    !camp.bulkBody?.trim() && { text: "Add the email body.", step: "template" as const },
    camp.subjectMode !== "AI" && !camp.subjectTemplate?.trim() && { text: "Enter a subject line.", step: "template" as const },
    !camp.senderProfileId && { text: "Choose your sender details.", step: "sender" as const },
  ].filter(Boolean) as { text: string; step: BulkStepSlug }[];

  async function generate(mode: "all" | "missing" | "failed") {
    setBusy(true);
    try {
      const res = await api<{ queued: number }>(`/api/campaigns/${campaignId}/bulk/generate`, { body: { mode } });
      toast.info(res.queued ? `${res.queued} emails queued for AI` : "Nothing to generate", res.queued ? "Progress updates below. Nothing is sent until you approve." : undefined);
      await refresh();
    } catch (err) {
      toast.error("Generation failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const done = c.generated > 0 && c.queued === 0;

  return (
    <Card>
      <CardHeader
        code={bulkStepCode("generate")}
        title="Generate emails"
        description="The AI fills in each contact's details, then makes small adjustments to your email body. Your format and sender details stay the same. If an AI draft fails the quality checks, your original text is used."
        actions={done ? <NextStep campaignId={campaignId} step="generate" label="Review emails" /> : undefined}
      />
      <CardBody className="space-y-4">
        {problems.length > 0 && (
          <Alert tone="warning" title="Finish these first">
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={p.text} className="flex flex-wrap items-center gap-x-2">
                  {p.text}
                  <ButtonLink href={bulkStepHref(campaignId, p.step)} size="xs" variant="tertiary">
                    Go to step
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {camp.generationPaused && camp.generationPausedReason && (
          <Alert tone="danger" title="Generation paused">
            {camp.generationPausedReason}
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Contacts" value={c.total} compact />
          <KpiCard label="AI drafted" value={c.generated} tone="violet" compact />
          <KpiCard label="Needs fixing" value={c.blocked} tone={c.blocked ? "danger" : "default"} compact />
          <KpiCard label="In AI queue" value={c.queued} live={c.queued > 0} compact />
        </div>
        {c.queued > 0 && (
          <div className="space-y-1.5" aria-live="polite">
            <p className="type-hint text-muted">
              Sorts is drafting… {c.generated} of {c.total} done
            </p>
            <SortsFlowLine value={c.generated / Math.max(1, c.total)} label={`AI drafts: ${c.generated} of ${c.total} done`} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={done ? "secondary" : "primary"}
            loading={busy}
            disabled={problems.length > 0 || c.queued > 0}
            onClick={() => void generate(c.generated ? "all" : "missing")}
            data-testid="bulk-generate"
          >
            {c.generated ? "Regenerate all emails" : `Generate ${c.total} emails`}
          </Button>
          {c.generated > 0 && c.generated < c.total && (
            <Button loading={busy} disabled={c.queued > 0} onClick={() => void generate("missing")}>
              Generate missing only
            </Button>
          )}
        </div>
        <p className="type-hint text-muted">Generating never sends anything. Emails you rejected stay rejected when you regenerate.</p>
      </CardBody>
    </Card>
  );
}
