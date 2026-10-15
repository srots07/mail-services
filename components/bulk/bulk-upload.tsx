"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, KpiCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { autoMapBulkColumns, BULK_FIELDS, BULK_HEADER_ALIASES, type BulkMapping } from "@/lib/bulk/fields";
import { bulkStepHref } from "@/lib/bulk/steps";
import { MAX_BULK_ROWS, validateBulkRows } from "@/lib/bulk/validate";
import { api } from "@/lib/client/api";
import { ACCEPTED_FILE_TYPES, parseCsvFile, type ParsedCsv } from "@/lib/csv/parse";
import { pdfPagesToRows, readPdfPieces } from "@/lib/csv/pdf";
import { cn } from "@/lib/utils";

const CONTACT_FILE_TYPES = `${ACCEPTED_FILE_TYPES},.pdf,application/pdf`;

type IssueFilter = "all" | "errors" | "warnings";

function isPdf(file: File) {
  return /\.pdf$/i.test(file.name) || file.type === "application/pdf";
}

export function BulkUpload() {
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<BulkMapping | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [importing, setImporting] = useState(false);
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");

  const missingRequired = mapping ? BULK_FIELDS.filter((f) => f.required && !mapping[f.key]) : [];
  const report = useMemo(() => (parsed && mapping && missingRequired.length === 0 ? validateBulkRows(parsed.rows, mapping) : null), [parsed, mapping, missingRequired.length]);
  const extraColumns = useMemo(() => (parsed && mapping ? parsed.headers.filter((h) => !Object.values(mapping).includes(h)) : []), [parsed, mapping]);
  const shownRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter((r) => (issueFilter === "errors" ? r.errors.length : issueFilter === "warnings" ? r.warnings.length : true)).slice(0, 300);
  }, [report, issueFilter]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    setReading(true);
    let p: ParsedCsv;
    try {
      p = isPdf(file) ? pdfPagesToRows(await readPdfPieces(file), BULK_HEADER_ALIASES) : await parseCsvFile(file);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Could not read this file.");
      return;
    } finally {
      setReading(false);
    }
    if (!p.headers.length || !p.rows.length) return setFileError("The file has no data rows.");
    if (p.rows.length > MAX_BULK_ROWS) return setFileError(`At most ${MAX_BULK_ROWS} rows can be imported at once (this file has ${p.rows.length}).`);
    setFileName(file.name);
    setParsed(p);
    setMapping(autoMapBulkColumns(p.headers));
    if (!campaignName) setCampaignName(file.name.replace(/\.(csv|xlsx|pdf)$/i, "").slice(0, 120));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  async function doImport() {
    if (!parsed || !mapping || !report) return;
    setImporting(true);
    try {
      const res = await api<{ campaignId: string; imported: number; skipped: number }>("/api/bulk/import", {
        body: { headers: parsed.headers, rows: parsed.rows, mapping, campaignName: campaignName.trim(), fileName },
      });
      toast.success(`Imported ${res.imported} contacts`, res.skipped ? `${res.skipped} invalid rows skipped` : undefined);
      router.push(bulkStepHref(res.campaignId, "template"));
    } catch (err) {
      toast.error("Import failed", err instanceof Error ? err.message : undefined);
      setImporting(false);
    }
  }

  if (!parsed) {
    return (
      <Card>
        <CardHeader title="Upload your contact file" description="Excel (.xlsx), CSV or PDF table, up to 10,000 rows. Columns: Company Name, To Name, From Name, Email. Any other column is kept as extra details for the AI." />
        <CardBody>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors sm:py-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              dragging ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent/50 hover:bg-panel-2",
            )}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
              {reading ? <FileSpreadsheet className="h-6 w-6 animate-pulse" strokeWidth={1.75} aria-hidden /> : <Upload className="h-6 w-6" strokeWidth={1.75} aria-hidden />}
            </div>
            <p className="text-sm font-medium" aria-live="polite">
              {reading ? "Reading file…" : "Drag and drop your file here, or click to browse"}
            </p>
            <p className="type-hint mt-1 text-muted">.xlsx, .csv or .pdf · up to 10,000 rows</p>
            <input ref={inputRef} type="file" accept={CONTACT_FILE_TYPES} className="hidden" data-testid="bulk-file" onChange={(e) => void handleFile(e.target.files?.[0])} />
          </div>
          {fileError && (
            <div className="mt-3">
              <Alert tone="danger">{fileError}</Alert>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  const s = report?.summary;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Match columns: ${fileName}`}
          description={`${parsed.rows.length} rows found. Pick the column for each field.`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setParsed(null)}>
              Choose another file
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {parsed.parseErrors.length > 0 && <Alert tone="info">{parsed.parseErrors.slice(0, 3).join(" ")}</Alert>}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BULK_FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} htmlFor={`map-${f.key}`}>
                <Select id={`map-${f.key}`} value={mapping?.[f.key] ?? ""} onChange={(e) => setMapping((m) => (m ? { ...m, [f.key]: e.target.value } : m))}>
                  <option value="">(not in file)</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          {extraColumns.length > 0 && <p className="type-hint text-muted">Extra details for the AI: {extraColumns.join(", ")}</p>}
          {missingRequired.length > 0 && <Alert tone="warning">Choose a column for: {missingRequired.map((f) => f.label).join(", ")}</Alert>}
        </CardBody>
      </Card>

      {s && report && (
        <Card>
          <CardHeader title="Check the rows" description="Rows with errors are skipped. Rows with warnings are imported." />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="bulk-validation-summary">
              <KpiCard label="Total rows" value={s.total} compact />
              <KpiCard label="Valid" value={s.valid} tone="success" compact />
              <KpiCard label="Invalid" value={s.invalid} tone={s.invalid ? "danger" : "default"} compact />
              <KpiCard label="Duplicate emails" value={s.duplicateEmails} tone={s.duplicateEmails ? "danger" : "default"} compact />
            </div>
            <Tabs
              label="Filter checked rows"
              value={issueFilter}
              onChange={setIssueFilter}
              items={[
                { key: "all", label: "All rows", count: s.total },
                { key: "errors", label: "Errors", count: s.invalid },
                { key: "warnings", label: "Warnings", count: s.withWarnings },
              ]}
            />
            <div className="overflow-hidden rounded-lg border border-line">
              <DataTable
                rows={shownRows}
                rowKey={(r) => String(r.rowNumber)}
                minWidth={760}
                frameClassName="max-h-96"
                label="Checked rows"
                empty="No rows match this filter."
                columns={[
                  { key: "row", header: "Row", cell: (r) => <span className="type-data text-muted">{r.rowNumber}</span> },
                  { key: "company", header: "Company", cell: (r) => r.companyName },
                  { key: "to", header: "To name", cell: (r) => r.toName },
                  { key: "from", header: "From name", cell: (r) => r.fromName || <span className="text-subtle">Your sender profile</span> },
                  { key: "email", header: "Email", cell: (r) => <span className="type-data">{r.email ?? <span className="text-subtle">Missing</span>}</span> },
                  {
                    key: "check",
                    header: "Check",
                    cell: (r) =>
                      r.errors.length ? (
                        <span className="text-xs text-danger">{r.errors.join("; ")}</span>
                      ) : r.warnings.length ? (
                        <span className="text-xs text-warning">{r.warnings.join("; ")}</span>
                      ) : (
                        <Badge tone="success">Ready</Badge>
                      ),
                  },
                ]}
              />
            </div>
            {shownRows.length === 300 && <p className="text-xs text-muted">Showing the first 300 matching rows.</p>}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[16rem] flex-1">
                <Field label="Campaign name *" htmlFor="bulk-name">
                  <Input id="bulk-name" value={campaignName} maxLength={200} onChange={(e) => setCampaignName(e.target.value)} />
                </Field>
              </div>
              <Button variant="primary" loading={importing} disabled={!s.valid || !campaignName.trim()} onClick={() => void doImport()} data-testid="bulk-import">
                Import {s.valid} contacts and continue
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
