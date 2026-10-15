import { normalizeHeader } from "./fields";
import { MAX_CSV_ROWS, sheetToParsed, type ParsedCsv } from "./parse";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 300;
const COLUMN_TOLERANCE = 3;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/i;

export interface TextPiece {
  x: number;
  y: number;
  width: number;
  height: number;
  str: string;
}

interface Cell {
  x: number;
  text: string;
}

/** Groups positioned text into visual lines (top to bottom), each sorted left to right. */
export function groupLines(pieces: TextPiece[]): TextPiece[][] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextPiece[][] = [];
  for (const piece of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - piece.y) <= Math.max(2, piece.height * 0.4)) line.push(piece);
    else lines.push([piece]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/** Splits a line into cells at wide gaps. */
function lineToCells(line: TextPiece[]): Cell[] {
  const cells: Cell[] = [];
  let current: Cell | null = null;
  let lastEnd = -Infinity;
  for (const piece of line) {
    const gap = piece.x - lastEnd;
    const charWidth = piece.str.length ? piece.width / piece.str.length : piece.height * 0.5;
    if (!current || gap > Math.max(10, charWidth * 2.5)) {
      if (current?.text.trim()) cells.push({ x: current.x, text: current.text.trim() });
      current = { x: piece.x, text: piece.str };
    } else {
      current.text += gap > charWidth * 0.2 && !current.text.endsWith(" ") ? ` ${piece.str}` : piece.str;
    }
    lastEnd = piece.x + piece.width;
  }
  if (current?.text.trim()) cells.push({ x: current.x, text: current.text.trim() });
  return cells;
}

/**
 * Reads a contacts table from PDF pages. The header row is the first line where at least two cells
 * match `knownHeaders`; every later text piece is assigned to the header column it starts under.
 * Without such a header, each line that contains an email address becomes a row (Column 1, Column 2...).
 */
export function pdfPagesToRows(pages: TextPiece[][], knownHeaders: ReadonlySet<string>): ParsedCsv {
  if (pages.every((p) => p.length === 0)) {
    throw new Error("This PDF has no selectable text (it may be a scanned image). Export the list as CSV or Excel, or use a text-based PDF.");
  }
  const linesByPage = pages.map(groupLines);
  let start: { page: number; line: number; columns: Cell[] } | null = null;
  for (let p = 0; p < linesByPage.length && !start; p++) {
    for (let l = 0; l < linesByPage[p].length; l++) {
      const cells = lineToCells(linesByPage[p][l]);
      if (cells.filter((c) => knownHeaders.has(normalizeHeader(c.text))).length >= 2) {
        start = { page: p, line: l, columns: cells };
        break;
      }
    }
  }

  let sheet: string[][];
  if (start) {
    const { columns } = start;
    const labels = columns.map((c) => c.text);
    const headerKey = labels.join("\u0000");
    const colFor = (x: number) => {
      let idx = 0;
      for (let i = 0; i < columns.length; i++) if (columns[i].x <= x + COLUMN_TOLERANCE) idx = i;
      return idx;
    };
    sheet = [labels];
    for (let p = start.page; p < linesByPage.length; p++) {
      const lines = linesByPage[p];
      for (let l = p === start.page ? start.line + 1 : 0; l < lines.length; l++) {
        const line = lines[l];
        if (lineToCells(line).map((c) => c.text).join("\u0000") === headerKey) continue;
        const values = columns.map(() => "");
        for (const piece of line) {
          const text = piece.str.trim();
          if (!text) continue;
          const col = colFor(piece.x);
          values[col] = values[col] ? `${values[col]} ${text}` : text;
        }
        if (values.filter(Boolean).length >= 2) sheet.push(values);
      }
    }
  } else {
    const rows = linesByPage.flat().map((l) => lineToCells(l).map((c) => c.text)).filter((cells) => cells.some((c) => EMAIL_RE.test(c)));
    const width = Math.max(0, ...rows.map((r) => r.length));
    sheet = [Array.from({ length: width }, (_, i) => `Column ${i + 1}`), ...rows];
  }

  const parsed = sheetToParsed(sheet);
  if (parsed.rows.length === 0) {
    throw new Error("No contacts were found in this PDF. Use a table with Company, To Name, From Name and Email columns.");
  }
  if (parsed.rows.length > MAX_CSV_ROWS) parsed.rows = parsed.rows.slice(0, MAX_CSV_ROWS);
  parsed.parseErrors.unshift(start ? "Read from a PDF table. Check the rows below before importing." : "Read from PDF text (one contact per line). Map the columns below.");
  return parsed;
}

/** Extracts positioned text from every page of a PDF in the browser. */
export async function readPdfPieces(file: File): Promise<TextPiece[][]> {
  if (file.size > MAX_PDF_BYTES) throw new Error(`PDF is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 20 MB.`);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") throw new Error("This PDF is password protected. Remove the password and upload it again.");
    throw new Error("Could not read this PDF. Make sure it is a valid, unencrypted PDF file.");
  }
  const pages: TextPiece[][] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PDF_PAGES); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pieces: TextPiece[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        pieces.push({ x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || Math.abs(item.transform[3]) || 10, str: item.str });
      }
      pages.push(pieces);
      page.cleanup();
    }
  } finally {
    void doc.destroy();
  }
  return pages;
}
