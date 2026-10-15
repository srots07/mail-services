"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { detectPlaceholders, renderBulkEmail } from "@/lib/bulk/placeholders";
import { bulkStepCode, bulkStepHref } from "@/lib/bulk/steps";
import { api } from "@/lib/client/api";
import { BODY_FILE_TYPES, parseBodyDocument } from "@/lib/email/body-document";
import type { BulkRowsResponse } from "@/lib/services/bulk";
import type { StepProps } from "./bulk-wizard";

interface TemplateView {
  id: string;
  name: string;
  body: string;
  subjectMode: "FIXED" | "AI";
  subjectTemplate: string | null;
  senderProfileId: string | null;
  aiInstructions: string | null;
  ccEmails: string[];
}

const DEFAULT_SUBJECT = "Introduction for [Company Name]";

export function BulkTemplateStep({ campaignId, overview, refresh }: StepProps) {
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const c = overview.campaign;
  const locked = ["SCHEDULED", "RUNNING", "COMPLETED"].includes(c.status);
  const [body, setBody] = useState(c.bulkBody ?? "");
  const [bodyFile, setBodyFile] = useState<{ name: string; notice?: string } | null>(null);
  const [subjectMode, setSubjectMode] = useState<"FIXED" | "AI">(c.subjectMode);
  const [subjectTemplate, setSubjectTemplate] = useState(c.subjectTemplate ?? DEFAULT_SUBJECT);
  const [aiInstructions, setAiInstructions] = useState(c.aiInstructions ?? "");
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [sample, setSample] = useState<{ customerName: string; companyName: string; fromName: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    api<{ templates: TemplateView[] }>("/api/campaign-templates")
      .then((r) => setTemplates(r.templates))
      .catch(() => undefined);
    api<BulkRowsResponse>(`/api/campaigns/${campaignId}/bulk/rows?page=1&pageSize=1`)
      .then((r) => r.items[0] && setSample({ customerName: r.items[0].customerName, companyName: r.items[0].companyName, fromName: r.items[0].fromName }))
      .catch(() => undefined);
  }, [campaignId]);

  const found = useMemo(() => detectPlaceholders(`${subjectMode === "FIXED" ? subjectTemplate : ""}\n${body}`), [body, subjectTemplate, subjectMode]);
  const unsupported = found.filter((p) => !p.key);
  const sender = overview.senderProfile;
  const preview = useMemo(() => {
    if (!sample || !body.trim()) return null;
    return renderBulkEmail({
      body,
      subjectTemplate: subjectMode === "FIXED" ? subjectTemplate : "(AI writes the subject for each contact)",
      recipient: sample,
      sender: sender
        ? { ...sender, email: sender.email ?? overview.connectedEmail }
        : { senderName: "", designation: null, companyName: null, email: overview.connectedEmail, phone: null, website: null },
      productLineFallback: c.productLineFallback,
    });
  }, [sample, body, subjectMode, subjectTemplate, sender, c.productLineFallback, overview.connectedEmail]);

  async function save(goNext: boolean) {
    if (!body.trim()) return toast.error("The email body is empty", "Upload a file or paste the text.");
    if (subjectMode === "FIXED" && !subjectTemplate.trim()) return toast.error("Enter a subject, or choose AI subjects");
    setBusy("save");
    try {
      await api(`/api/campaigns/${campaignId}/bulk`, { method: "PUT", body: { bulkBody: body, subjectMode, subjectTemplate, aiInstructions } });
      await refresh();
      toast.success("Email body saved");
      if (goNext) router.push(bulkStepHref(campaignId, "sender"));
    } catch (err) {
      toast.error("Could not save", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return toast.error("Name the template first");
    setBusy("template");
    try {
      const t = await api<TemplateView>("/api/campaign-templates", {
        body: { name: templateName.trim(), body, subjectMode, subjectTemplate, aiInstructions, senderProfileId: c.senderProfileId, ccEmails: c.ccEmails },
      });
      setTemplates((list) => [t, ...list]);
      setTemplateName("");
      toast.success(`Saved template "${t.name}"`);
    } catch (err) {
      toast.error("Could not save template", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(t.body);
    setSubjectMode(t.subjectMode);
    setSubjectTemplate(t.subjectTemplate ?? "");
    setAiInstructions(t.aiInstructions ?? "");
    setBodyFile(null);
    toast.info(`Loaded "${t.name}"`, "Save to apply it to this campaign.");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      const doc = await parseBodyDocument(file);
      setBody(doc.text);
      setBodyFile({ name: file.name, notice: doc.notice });
    } catch (err) {
      toast.error("Could not read the file", err instanceof Error ? err.message : undefined);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          code={bulkStepCode("template")}
          title="Email body"
          description="Upload or paste your email once (Word, PDF or text). Every contact gets this same format; the AI only fills in and lightly adjusts it for each contact."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button loading={busy === "save"} disabled={locked} onClick={() => void save(false)}>
                Save
              </Button>
              <Button variant="primary" loading={busy === "save"} disabled={locked} onClick={() => void save(true)} data-testid="bulk-template-save">
                Save mail body and continue
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          {locked && <Alert tone="info">This campaign is sending or finished, so the email body can no longer change.</Alert>}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
              <FileText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-[12rem] flex-1">
              <p className="text-sm font-medium">{bodyFile ? bodyFile.name : "Upload email body file"}</p>
              <p className="text-xs text-muted">{bodyFile?.notice ?? ".docx, .pdf or .txt, up to 5 MB. You can also paste the text below."}</p>
            </div>
            <Button loading={reading} disabled={locked} onClick={() => fileRef.current?.click()} data-testid="bulk-body-upload">
              {bodyFile ? "Replace file" : "Choose file"}
            </Button>
            <input ref={fileRef} type="file" accept={BODY_FILE_TYPES} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            {templates.length > 0 && (
              <div className="min-w-[12rem]">
                <Select aria-label="Load saved template" value="" onChange={(e) => loadTemplate(e.target.value)}>
                  <option value="">Load a saved template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <Field label="Email body *" htmlFor="bulk-body" hint="Optional placeholders: [To Name], [Company Name], [From Name]. Your signature is added below the body automatically (next step).">
            <Textarea id="bulk-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} className="type-data" />
          </Field>

          {found.length > 0 && (
            <div className="space-y-1.5">
              <p className="type-mono-label text-muted">Detected placeholders</p>
              <div className="flex flex-wrap gap-1.5" data-testid="bulk-placeholders">
                {found.map((p) => (
                  <Badge key={p.token} tone={p.key ? "success" : "danger"} wrap>
                    {p.token} {p.key ? `= ${p.label}` : "= not supported"}
                  </Badge>
                ))}
              </div>
              {unsupported.length > 0 && <Alert tone="warning">Unsupported placeholders stay in the email and block approval: {unsupported.map((p) => p.token).join(", ")}</Alert>}
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="type-mono-label text-muted">Subject</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="subject-mode" checked={subjectMode === "FIXED"} onChange={() => setSubjectMode("FIXED")} disabled={locked} style={{ accentColor: "var(--accent)" }} />
              Same subject for everyone (placeholders allowed)
            </label>
            {subjectMode === "FIXED" && <Input aria-label="Subject" value={subjectTemplate} maxLength={300} onChange={(e) => setSubjectTemplate(e.target.value)} disabled={locked} />}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="subject-mode" checked={subjectMode === "AI"} onChange={() => setSubjectMode("AI")} disabled={locked} style={{ accentColor: "var(--accent)" }} />
              AI writes a subject for each contact
            </label>
          </fieldset>

          <Field label="Instructions for the AI (optional)" htmlFor="bulk-ai" hint="For example: mention the contact's city if it is in the file. The AI keeps your format and never invents facts.">
            <Textarea id="bulk-ai" rows={3} value={aiInstructions} maxLength={2000} onChange={(e) => setAiInstructions(e.target.value)} disabled={locked} />
          </Field>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1">
              <Field label="Save as reusable template" htmlFor="tpl-name">
                <Input id="tpl-name" placeholder="Template name" value={templateName} maxLength={200} onChange={(e) => setTemplateName(e.target.value)} />
              </Field>
            </div>
            <Button loading={busy === "template"} disabled={!body.trim()} onClick={() => void saveAsTemplate()}>
              Save template
            </Button>
          </div>
        </CardBody>
      </Card>

      {preview && sample && (
        <Card>
          <CardHeader title="Preview (before AI adjustments)" description={`First contact: ${sample.customerName} (${sample.companyName})${sender ? "" : ". Add your sender details in the next step to see the signature."}`} />
          <CardBody className="space-y-2">
            {preview.problems.length > 0 && <Alert tone="warning">{preview.problems.join("; ")}</Alert>}
            <p className="text-sm font-medium">{preview.subject}</p>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-panel-2 p-3 font-sans text-sm">{preview.body}</pre>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
