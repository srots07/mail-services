"use client";

import { useState } from "react";
import { EmailPreview } from "@/components/email/email-preview";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import type { BulkOverview, BulkRowItem } from "@/lib/services/bulk";

const LOCKED = new Set(["SCHEDULED", "SENDING", "SENT"]);

export function BulkRowDrawer({
  campaignId,
  row,
  overview,
  onClose,
  onChanged,
}: {
  campaignId: string;
  row: BulkRowItem;
  overview: BulkOverview;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"view" | "edit" | "preview">(row.email ? "preview" : "view");
  const [subject, setSubject] = useState(row.email?.subject ?? "");
  const [body, setBody] = useState(row.email?.body ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [testTo, setTestTo] = useState(overview.connectedEmail ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const sender = overview.senderSnapshot ?? (overview.senderProfile ? { ...overview.senderProfile } : null);
  const cc = overview.campaign.ccEmails;
  const locked = LOCKED.has(row.status) || ["SCHEDULED", "RUNNING", "COMPLETED"].includes(overview.campaign.status);

  async function act(name: string, fn: () => Promise<unknown>, success: string, close = true) {
    setBusy(name);
    try {
      await fn();
      toast.success(success);
      onChanged();
      if (close) onClose();
    } catch (err) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const fromName = row.fromName || sender?.senderName || "";
  const fromLine = `${fromName || overview.connectedEmail || "(no sender)"}${overview.connectedEmail && fromName ? ` <${overview.connectedEmail}>` : ""}`;
  const extra = Object.entries(row.extra);

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`#${row.number} ${row.customerName} · ${row.companyName}`}
      description={<StatusBadge status={row.displayStatus} />}
      footer={
        locked ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button
              variant="outline"
              loading={busy === "regen"}
              onClick={() => void act("regen", () => api(`/api/campaigns/${campaignId}/bulk/generate`, { body: { mode: "selected", ids: [row.id] } }), "Queued for AI regeneration")}
            >
              Regenerate
            </Button>
            {row.email && row.approvalStatus !== "REJECTED" && (
              <Button variant="danger" loading={busy === "reject"} onClick={() => void act("reject", () => api(`/api/campaigns/${campaignId}/recipients/reject`, { body: { ids: [row.id] } }), "Email rejected")}>
                Reject
              </Button>
            )}
            {row.email && row.approvalStatus !== "APPROVED" && (
              <Button
                variant="primary"
                loading={busy === "approve"}
                disabled={!row.to || Boolean(row.problem)}
                onClick={() =>
                  void act(
                    "approve",
                    async () => {
                      const r = await api<{ approved: number }>(`/api/campaigns/${campaignId}/recipients/approve`, { body: { ids: [row.id] } });
                      if (!r.approved) throw new Error("This email cannot be approved yet. Fix the problems shown first.");
                    },
                    "Email approved",
                  )
                }
              >
                Approve
              </Button>
            )}
          </>
        )
      }
    >
      {row.email && (
        <Tabs
          className="mb-4"
          label="Email view"
          value={mode}
          onChange={setMode}
          items={[
            { key: "preview", label: "Preview" },
            { key: "view", label: "Details" },
            ...(locked ? [] : [{ key: "edit" as const, label: "Edit" }]),
          ]}
        />
      )}
      {mode === "preview" && row.email ? (
        <div className="space-y-4">
          {row.problem && <Alert tone="danger" title="Fix before approval">{row.problem}</Alert>}
          <EmailPreview
            account={overview.connectedEmail ? { email: overview.connectedEmail, displayName: null, provider: "" } : null}
            contact={{ email: row.to, fromPersonName: row.fromName || null }}
            email={{ subject: row.email.subject, body: row.email.body }}
            senderName={sender?.senderName}
            cc={cc}
          />
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
            <div className="min-w-[16rem] flex-1">
              <Field label="Send a test of this email to" htmlFor={`test-${row.id}`} hint="Goes only to this address, without CC. Not counted as a campaign send.">
                <Input id={`test-${row.id}`} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@yourcompany.com" />
              </Field>
            </div>
            <Button
              loading={busy === "test"}
              disabled={!testTo.trim()}
              onClick={() => void act("test", () => api(`/api/campaigns/${campaignId}/test-email`, { body: { campaignContactId: row.id, to: testTo.trim() } }), `Test email sent to ${testTo.trim()}`, false)}
            >
              Send test
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {row.problem && <Alert tone="danger" title="Fix before approval">{row.problem}</Alert>}
          {row.errorMessage && <Alert tone="danger" title="Send error">{row.errorMessage}</Alert>}
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="type-mono-label text-muted">From</dt>
            <dd>{fromLine}</dd>
            <dt className="type-mono-label text-muted">To</dt>
            <dd data-testid="bulk-row-to">{row.to ?? <span className="text-danger">No email address</span>}</dd>
            <dt className="type-mono-label text-muted">CC</dt>
            <dd>{cc.length ? cc.join(", ") : <span className="text-subtle">none</span>}</dd>
            <dt className="type-mono-label text-muted">To name</dt>
            <dd>{row.customerName}</dd>
            <dt className="type-mono-label text-muted">Company</dt>
            <dd>{row.companyName}</dd>
            {extra.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="type-mono-label truncate text-muted" title={k}>
                  {k}
                </dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
            <dt className="type-mono-label text-muted">AI</dt>
            <dd>{row.email ? (row.aiUsed ? `Used (${row.email.model})` : row.email.editedByUser ? "Edited by you" : "AI draft not used, so your original email body was kept") : "Not generated yet"}</dd>
          </dl>

          {!locked && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
              <div className="min-w-[16rem] flex-1">
                <Field label="Correct the email address" htmlFor={`manual-${row.id}`}>
                  <Input id={`manual-${row.id}`} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={row.to ?? "name@company.com"} />
                </Field>
              </div>
              <Button
                loading={busy === "manual"}
                disabled={!newEmail.trim()}
                onClick={() => void act("manual", () => api(`/api/campaigns/${campaignId}/bulk/rows/${row.id}/email`, { method: "PUT", body: { email: newEmail } }), "Email address updated")}
              >
                Save address
              </Button>
            </div>
          )}

          {mode === "edit" ? (
            <div className="space-y-3">
              <Field label="Subject" htmlFor="edit-subject">
                <Input id="edit-subject" value={subject} maxLength={250} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Body" htmlFor="edit-body">
                <Textarea id="edit-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setMode("view")}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={busy === "save"}
                  onClick={() => void act("save", () => api(`/api/campaigns/${campaignId}/recipients/${row.id}`, { method: "PATCH", body: { subject, body } }), "Email saved (needs approval)")}
                >
                  Save changes
                </Button>
              </div>
            </div>
          ) : row.email ? (
            <div className="space-y-2">
              <p className="type-mono-label text-muted">Subject</p>
              <p className="text-sm font-medium" data-testid="bulk-row-subject">
                {row.email.subject || <span className="text-danger">(empty)</span>}
              </p>
              <p className="type-mono-label text-muted">Body</p>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-panel-2 p-3 font-sans text-sm" data-testid="bulk-row-body">
                {row.email.body}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted">No email generated for this contact yet. Use the Generate step.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
