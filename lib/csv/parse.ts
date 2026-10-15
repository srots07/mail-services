import Papa from "papaparse";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 10_000;

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  parseErrors: string[];
}

export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  const parseErrors = result.errors.slice(0, 20).map((e) => (e.row !== undefined ? `Row ${e.row + 2}: ${e.message}` : e.message));
  if (result.data.length > MAX_CSV_ROWS) {
    parseErrors.unshift(`File has ${result.data.length} rows; only the first ${MAX_CSV_ROWS} will be processed.`);
  }
  return { headers, rows: result.data.slice(0, MAX_CSV_ROWS), parseErrors };
}

export const ACCEPTED_FILE_TYPES = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v);
}

/** First row = headers (blank/duplicate headers get unique names), remaining non-empty rows = data. */
export function sheetToParsed(data: unknown[][]): ParsedCsv {
  const width = Math.max(0, ...data.map((r) => r.length));
  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, i) => {
    const base = cellText(data[0]?.[i]).trim();
    if (!base) return "";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}_${n}` : base;
  });
  const rows = data
    .slice(1)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, cellText(r[i])]).filter(([h]) => h)) as Record<string, string>)
    .filter((r) => Object.values(r).some((v) => v.trim()));
  const parseErrors = rows.length > MAX_CSV_ROWS ? [`File has ${rows.length} rows; only the first ${MAX_CSV_ROWS} will be processed.`] : [];
  return { headers: headers.filter(Boolean), rows: rows.slice(0, MAX_CSV_ROWS), parseErrors };
}

export async function parseCsvFile(file: File): Promise<ParsedCsv> {
  if (file.size > MAX_CSV_BYTES) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 5 MB.`);
  }
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type === XLSX_MIME;
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files are not supported. In Excel use File > Save As > Excel Workbook (.xlsx) or CSV.");
  if (!isXlsx && !/\.csv$/i.test(file.name) && file.type !== "text/csv") {
    throw new Error("Please upload a .csv or .xlsx file.");
  }
  let parsed: ParsedCsv;
  if (isXlsx) {
    const { readSheet } = await import("read-excel-file/browser");
    try {
      parsed = sheetToParsed(await readSheet(file, { trim: false }));
    } catch {
      throw new Error("Could not read this Excel file. Make sure it is a valid .xlsx workbook (the first sheet is imported).");
    }
  } else {
    parsed = parseCsvText(await file.text());
  }
  if (parsed.headers.length === 0) throw new Error("The file has no header row.");
  if (parsed.rows.length === 0) throw new Error("The file has no data rows.");
  return parsed;
}
