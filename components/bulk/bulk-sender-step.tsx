"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { hasSenderPlaceholders, senderSignature } from "@/lib/bulk/placeholders";
import { bulkStepCode, bulkStepHref } from "@/lib/bulk/steps";
import { api } from "@/lib/client/api";
import { isValidEmail } from "@/lib/csv/validate";
import { MAX_CC } from "@/lib/validation/bulk";
import type { StepProps } from "./bulk-wizard";
import { SenderProfiles } from "./sender-profiles";

export function BulkSenderStep({ campaignId, overview, refresh }: StepProps) {
  const toast = useToast();
  const router = useRouter();
  const c = overview.campaign;
  const locked = ["SCHEDULED", "RUNNING", "COMPLETED"].includes(c.status);
  const [cc, setCc] = useState<string[]>(c.ccEmails);
  const [ccInput, setCcInput] = useState("");
  const [busy, setBusy] = useState(false);

  const sender = overview.senderProfile;
  const signature = useMemo(
    () => (sender ? senderSignature({ ...sender, email: sender.email ?? overview.connectedEmail }, null) : ""),
    [sender, overview.connectedEmail],
  );
  const bodyPlacesSender = hasSenderPlaceholders(c.bulkBody ?? "");

  async function selectProfile(id: string) {
    try {
      await api(`/api/campaigns/${campaignId}/bulk`, { method: "PUT", body: { senderProfileId: id } });
      await refresh();
    } catch (err) {
      toast.error("Could not set the sender", err instanceof Error ? err.message : undefined);
    }
  }

  function addCc() {
    const parts = ccInput
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    const bad = parts.filter((p) => !isValidEmail(p));
    if (bad.length) return toast.error("Invalid CC address", bad.slice(0, 3).join(", "));
    const next = [...new Set([...cc, ...parts])];
    if (next.length > MAX_CC) return toast.error(`At most ${MAX_CC} CC addresses`);
    setCc(next);
    setCcInput("");
  }

  async function saveAndContinue() {
    if (ccInput.trim()) return toast.error("Click Add to include the CC address you typed, or clear the field");
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaignId}/bulk`, { method: "PUT", body: { ccEmails: cc } });
      await refresh();
      router.push(bulkStepHref(campaignId, "generate"));
    } catch (err) {
      toast.error("Could not save CC", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          code={bulkStepCode("sender")}
          title="Sender details & CC"
          description="Your signature is added below the email body, in the same format on every email. CC addresses are copied on every email; each contact still gets their own separate email."
          actions={
            <Button variant="primary" loading={busy} disabled={!c.senderProfileId || locked} onClick={() => void saveAndContinue()} data-testid="bulk-sender-continue">
              Use this sender and continue
            </Button>
          }
        />
        <CardBody className="space-y-5">
          {locked && <Alert tone="info">This campaign is sending or finished, so the sender and CC can no longer change.</Alert>}
          {!c.senderProfileId && !locked && <Alert tone="warning">Choose or create a sender profile to continue.</Alert>}
          <section className="space-y-2" aria-labelledby="sender-heading">
            <h3 id="sender-heading" className="type-h4 text-fg">
              Sender
            </h3>
            <SenderProfiles selectedId={c.senderProfileId} onSelect={(id) => void selectProfile(id)} onChange={() => void refresh()} />
          </section>

          {signature && (
            <section className="space-y-2" aria-labelledby="signature-heading">
              <h3 id="signature-heading" className="type-h4 text-fg">
                Signature preview
              </h3>
              {bodyPlacesSender ? (
                <Alert tone="info">Your email body already contains sender placeholders, so they are filled in place and no extra signature is added.</Alert>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-panel-2 p-3 font-sans text-sm" data-testid="bulk-signature">
                  {signature}
                </pre>
              )}
              <p className="type-hint text-muted">If a row in your file has a From Name, that name is used on the first line instead.</p>
            </section>
          )}

          <section className="space-y-2" aria-labelledby="cc-heading">
            <h3 id="cc-heading" className="type-h4 text-fg">
              CC on every email
            </h3>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[16rem] flex-1">
                <Field label="Add CC address" htmlFor="cc-input" hint={`Up to ${MAX_CC}. Separate several with commas.`}>
                  <Input
                    id="cc-input"
                    type="text"
                    placeholder="manager@yourcompany.com"
                    value={ccInput}
                    disabled={locked}
                    onChange={(e) => setCcInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCc();
                      }
                    }}
                    data-testid="cc-input"
                  />
                </Field>
              </div>
              <Button disabled={locked || !ccInput.trim()} onClick={addCc}>
                Add
              </Button>
            </div>
            {cc.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" data-testid="cc-list">
                {cc.map((addr) => (
                  <li key={addr} className="flex items-center gap-1 rounded-full border border-line bg-panel-2 py-1 pl-3 pr-1 text-xs">
                    {addr}
                    <button
                      type="button"
                      aria-label={`Remove ${addr}`}
                      disabled={locked}
                      className="rounded-full p-0.5 text-muted hover:bg-panel-3 hover:text-fg"
                      onClick={() => setCc((list) => list.filter((x) => x !== addr))}
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-hint text-muted">No CC. Emails go only to each contact.</p>
            )}
          </section>
        </CardBody>
      </Card>
    </div>
  );
}
