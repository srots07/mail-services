"use client";

import { ArrowRight, Download, RotateCw, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogsPanel } from "@/components/campaigns/logs-panel";
import { LicenseLock, useLicense } from "@/components/license/license-notice";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader, KpiCard } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, LoadingState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { bulkStepCode, bulkStepHref } from "@/lib/bulk/steps";
import { api } from "@/lib/client/api";
import type { getBulkSendSummary } from "@/lib/queue/sending";
import { BulkRowsTable } from "./bulk-rows-table";
import type { StepProps } from "./bulk-wizard";
import { SendTimeline } from "./send-timeline";

type Summary = Awaited<ReturnType<typeof getBulkSendSummary>>;

const SENDING_STATES = new Set(["SCHEDULED", "RUNNING", "PAUSED", "COMPLETED"]);

function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

function localDefaults() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:00` };
}

function SendingControls({ campaignId, status, refresh }: { campaignId: string; status: string; refresh: () => Promise<unknown> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(name: string, url: string, body: unknown, msg: string) {
    setBusy(name);
    try {
      await api(url, { body });
      toast.success(msg);
      await refresh();
    } catch (err) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(status === "SCHEDULED" || status === "RUNNING") && (
        <Button loading={busy === "pause"} onClick={() => void run("pause", `/api/campaigns/${campaignId}/send/pause`, {}, "Sending paused")}>
          Pause sending
        </Button>
      )}
      {status === "PAUSED" && (
        <Button variant="primary" loading={busy === "resume"} onClick={() => void run("resume", `/api/campaigns/${campaignId}/send/resume`, { confirm: true }, "Sending resumed")}>
          Resume sending
        </Button>
      )}
      {status !== "COMPLETED" && (
        <Button
          variant="danger"
          loading={busy === "cancel"}
          onClick={() => window.confirm("Stop all emails that have not been sent yet?") && void run("cancel", `/api/campaigns/${campaignId}/send/cancel`, {}, "Remaining emails cancelled")}
        >
          Cancel remaining
        </Button>
      )}
    </div>
  );
}

export function BulkSendStep({ campaignId, overview, refresh }: StepProps) {
  const toast = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"now" | "at">("now");
  const defaults = useMemo(() => localDefaults(), []);
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const zones = useMemo(() => timeZones(), []);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [interval, setIntervalSec] = useState(30);
  const [confirmText, setConfirmText] = useState("");
  const [countText, setCountText] = useState("");
  const [sending, setSending] = useState(false);
  const { license, reload: reloadLicense } = useLicense();
  const locked = license !== null && !license.canSend;
  const status = overview.campaign.status;

  const load = useCallback(() => {
    api<Summary>(`/api/campaigns/${campaignId}/bulk/send`)
      .then((s) => {
        setSummary(s);
        setIntervalSec(s.defaultIntervalSeconds);
      })
      .catch(() => undefined);
  }, [campaignId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, status]);

  if (SENDING_STATES.has(status)) {
    return (
      <Card>
        <CardHeader
          code={bulkStepCode("send")}
          title="Send"
          description={status === "COMPLETED" ? "This campaign has finished sending." : "This campaign was approved and is sending on its schedule."}
          actions={
            <ButtonLink href={bulkStepHref(campaignId, "results")} variant="primary">
              View results
              <ArrowRight aria-hidden />
            </ButtonLink>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Status: <StatusBadge status={status} />
            {overview.campaign.scheduleStartAt && (
              <span className="text-muted">
                Starts {new Date(overview.campaign.scheduleStartAt).toLocaleString()}
                {overview.campaign.scheduleTimezone ? ` (scheduled in ${overview.campaign.scheduleTimezone})` : ""}
              </span>
            )}
          </div>
          {locked && status !== "COMPLETED" && <LicenseLock license={license} onRecheck={reloadLicense} />}
          {overview.campaign.pausedReason && status === "PAUSED" && <Alert tone="warning">{overview.campaign.pausedReason}</Alert>}
          <SendingControls campaignId={campaignId} status={status} refresh={refresh} />
        </CardBody>
      </Card>
    );
  }

  const c = summary?.counts;
  const countOk = !summary?.requireCount || Number(countText) === c?.willSend;
  const canConfirm = summary && confirmText.trim() === summary.confirmText && countOk && (mode === "now" || (date && time && timezone));

  async function send() {
    if (!summary || !canConfirm) return;
    setSending(true);
    try {
      const res = await api<{ scheduled: number; firstAt: string; failedVerification: number }>(`/api/campaigns/${campaignId}/bulk/send`, {
        body: {
          confirmText,
          expectedCount: summary.requireCount ? Number(countText) : undefined,
          startMode: mode,
          ...(mode === "at" ? { date, time, timezone } : {}),
          intervalSeconds: interval,
        },
      });
      toast.success(
        mode === "now" ? `Sending ${res.scheduled} emails` : `Scheduled ${res.scheduled} emails`,
        `First at ${new Date(res.firstAt).toLocaleString()}${res.failedVerification ? `; ${res.failedVerification} failed final checks and were not scheduled` : ""}`,
      );
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error("Not sent", err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader
        code={bulkStepCode("send")}
        title="Send"
        description="Nothing has been sent yet. Check the summary, then send or schedule every valid email in one confirmed step. Each contact gets their own email."
        actions={
          <Button variant="primary" disabled={!summary?.canSend || locked} onClick={() => setOpen(true)} data-testid="bulk-final-open">
            <Send aria-hidden />
            Start sending
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {locked && <LicenseLock license={license} onRecheck={reloadLicense} />}
        {!summary ? (
          <LoadingState variant="kpis" message="Checking what will be sent" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <KpiCard label="Will be sent" value={c!.willSend} tone="accent" compact />
              <KpiCard label="Already approved" value={c!.approved} compact />
              <KpiCard label="Rejected" value={c!.rejected} compact />
              <KpiCard label="Needs fixing" value={c!.blocked} tone={c!.blocked ? "danger" : "default"} compact />
              <KpiCard label="Not drafted" value={c!.notGenerated} compact />
            </div>
            {summary.warnings.map((w) => (
              <Alert key={w} tone="warning">
                {w}
              </Alert>
            ))}
            {summary.sender ? (
              <p className="text-sm">
                Sending from <strong>{summary.sender.name ? `${summary.sender.name} <${summary.sender.email}>` : summary.sender.email}</strong> ({summary.sender.provider === "MOCK" ? "test mode, not delivered" : "Gmail"})
              </p>
            ) : (
              <Alert
                tone="danger"
                action={
                  <ButtonLink href="/settings#sending-account" size="sm" variant="secondary">
                    Open settings
                  </ButtonLink>
                }
              >
                Connect Gmail before sending.
              </Alert>
            )}
            <p className="text-sm" data-testid="bulk-send-cc">
              CC on every email: <strong>{summary.cc.length ? summary.cc.join(", ") : "none"}</strong>
            </p>
          </>
        )}
      </CardBody>

      {summary && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          size="lg"
          title="Confirm and send"
          description={`${c!.willSend} separate emails will be sent from ${summary.sender?.email ?? "(not connected)"}${summary.cc.length ? `, each with CC ${summary.cc.join(", ")}` : ""}. Rejected and invalid rows are excluded.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={sending} disabled={!canConfirm} onClick={() => void send()} data-testid="bulk-final-send">
                {mode === "now" ? `Send ${c!.willSend} emails` : `Schedule ${c!.willSend} emails`}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="type-mono-label text-muted">When</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="send-mode" checked={mode === "now"} onChange={() => setMode("now")} style={{ accentColor: "var(--accent)" }} />
                Send now
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="send-mode" checked={mode === "at"} onChange={() => setMode("at")} style={{ accentColor: "var(--accent)" }} />
                Schedule for later
              </label>
            </fieldset>
            {mode === "at" && (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
                <Field label="Date" htmlFor="send-date">
                  <Input id="send-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Time" htmlFor="send-time">
                  <Input id="send-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </Field>
                <Field label="Time zone" htmlFor="send-tz">
                  <Select id="send-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <Field label="Seconds between emails" htmlFor="send-interval" hint="Emails go out one at a time in row order.">
              <Input id="send-interval" type="number" min={1} max={3600} value={interval} onChange={(e) => setIntervalSec(Math.max(1, Math.min(3600, Number(e.target.value) || 1)))} />
            </Field>
            {summary.requireCount && (
              <Field label={`Large campaign: type ${c!.willSend} to confirm the number of emails`} htmlFor="send-count">
                <Input id="send-count" inputMode="numeric" value={countText} onChange={(e) => setCountText(e.target.value)} />
              </Field>
            )}
            <Field label={`Type "${summary.confirmText}" to confirm`} htmlFor="send-confirm">
              <Input id="send-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" data-testid="bulk-confirm-text" />
            </Field>
            {summary.sender?.provider === "MOCK" && <Alert tone="warning">Test mode: these emails will not actually be delivered.</Alert>}
          </div>
        </Modal>
      )}
    </Card>
  );
}

export function BulkResultsStep({ campaignId, overview, version, refresh }: StepProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const c = overview.counts;
  const pending = Math.max(0, c.total - c.sent - c.failed - c.rejected - c.scheduled - c.sending);

  async function retry() {
    setBusy(true);
    try {
      const r = await api<{ retried: number }>(`/api/campaigns/${campaignId}/retry-failed`, { body: {} });
      toast.success(`Retrying ${r.retried} failed emails`);
      await refresh();
    } catch (err) {
      toast.error("Retry failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          code={bulkStepCode("results")}
          title="Results"
          description="Live status of every email. The CSV export includes company, names, email, CC, subject, body, status, sent time and any error."
          actions={
            <div className="flex flex-wrap gap-2">
              {c.failed > 0 && (
                <Button variant="primary" loading={busy} onClick={() => void retry()}>
                  <RotateCw aria-hidden />
                  Retry {c.failed} failed
                </Button>
              )}
              <a href={`/api/campaigns/${campaignId}/export`} download className={buttonClasses({ variant: c.failed > 0 ? "secondary" : "primary" })}>
                <Download aria-hidden />
                Export CSV
              </a>
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" data-testid="bulk-results-counts">
            <KpiCard label="Sent" value={c.sent} tone="success" compact />
            <KpiCard label="Failed" value={c.failed} tone={c.failed ? "danger" : "default"} compact />
            <KpiCard label="Scheduled" value={c.scheduled + c.sending} tone={c.scheduled + c.sending ? "accent" : "default"} live={c.sending > 0} compact />
            <KpiCard label="Pending" value={pending} compact />
            <KpiCard label="Rejected" value={c.rejected} compact />
          </div>
          {["SCHEDULED", "RUNNING", "PAUSED"].includes(overview.campaign.status) && <SendingControls campaignId={campaignId} status={overview.campaign.status} refresh={refresh} />}
          <BulkRowsTable campaignId={campaignId} overview={overview} mode="results" version={version} onChanged={() => void refresh()} />
        </CardBody>
      </Card>
      <SendTimeline campaignId={campaignId} version={version} />
      <LogsPanel campaignId={campaignId} />
    </div>
  );
}
