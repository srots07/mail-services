import type { TextPiece } from "@/lib/csv/pdf";

export const MAX_BODY_FILE_BYTES = 5 * 1024 * 1024;
export const BODY_FILE_TYPES = ".docx,.pdf,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain";

const BULLET = "\u2022";
/** Symbol / Wingdings bullets are stored as private-use characters. */
const SYMBOL_BULLET_RE = /^[\s\uF000-\uF0FF\u00B7\u25AA\u25CF\u25E6\u2023\u2043\u2219\u2022\u25A0\u25A1\u27A2\u2713\u2714-]+(?=\S)/;

/** Lines after a sign-off are the signature block and are kept together. */
const SIGN_OFF_RE = /^((best|kind|warm|warmest)\s+)?(regards|wishes)[,!.]?$|^(sincerely|thanks|thank you|many thanks|cheers|yours (sincerely|truly|faithfully))[,!.]?$/i;

export interface BodyDocument {
  text: string;
  notice?: string;
}

interface Para {
  text: string;
  list: boolean;
}

function cleanBullet(p: Para): string {
  const text = p.text.replace(/[ \t]+$/g, "");
  const symbol = text.match(SYMBOL_BULLET_RE);
  if (symbol && (p.list || /[\uF000-\uF0FF\u00B7\u2022\u25CF\u25AA]/.test(symbol[0]))) return `${BULLET} ${text.slice(symbol[0].length).trimStart()}`;
  return p.list && text.trim() ? `${BULLET} ${text.trimStart()}` : text;
}

/**
 * Joins paragraphs. Word documents that space paragraphs with "space after" (no empty paragraphs) get a blank
 * line between paragraphs; consecutive list items stay together. PDF lines are wrapped text, never spaced.
 */
function joinParagraphs(paras: Para[], spaceParagraphs: boolean): string {
  const hasBlank = !spaceParagraphs || paras.some((p) => !p.text.trim());
  const lines: string[] = [];
  let signature = false;
  paras.forEach((p, i) => {
    const line = cleanBullet(p);
    const prev = paras[i - 1];
    const isItem = line.startsWith(BULLET);
    if (!hasBlank && i > 0 && line.trim() && prev?.text.trim() && !signature && !(isItem && cleanBullet(prev).startsWith(BULLET))) lines.push("");
    lines.push(line.trim() ? line : "");
    if (SIGN_OFF_RE.test(line.trim())) signature = true;
  });
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function paragraphText(p: Element): string {
  let out = "";
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      switch (child.localName) {
        case "t":
          out += child.textContent ?? "";
          break;
        case "tab":
          out += "\t";
          break;
        case "br":
        case "cr":
          out += "\n";
          break;
        case "sym":
          out += BULLET;
          break;
        case "delText":
        case "instrText":
        case "pPr":
        case "rPr":
          break;
        default:
          walk(child);
      }
    }
  };
  walk(p);
  return out;
}

async function parseDocx(file: File): Promise<BodyDocument> {
  const { unzipSync, strFromU8 } = await import("fflate");
  let xml: string;
  try {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === "word/document.xml" });
    const doc = files["word/document.xml"];
    if (!doc) throw new Error("missing document.xml");
    xml = strFromU8(doc);
  } catch {
    throw new Error("Could not read this Word file. Make sure it is a valid .docx document.");
  }
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  if (dom.getElementsByTagName("parsererror").length) throw new Error("Could not read this Word file. Make sure it is a valid .docx document.");
  const body = dom.getElementsByTagName("w:body")[0] ?? dom.documentElement;
  const paras: Para[] = Array.from(body.getElementsByTagName("w:p")).map((p) => ({
    text: paragraphText(p),
    list: p.getElementsByTagName("w:numPr").length > 0,
  }));
  return { text: joinParagraphs(paras, true), notice: "Read from a Word document. Check the text before saving." };
}

async function parsePdf(file: File): Promise<BodyDocument> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") throw new Error("This PDF is password protected. Remove the password and upload it again.");
    throw new Error("Could not read this PDF. Make sure it is a valid, unencrypted PDF file.");
  }
  const paras: Para[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pieces: TextPiece[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        pieces.push({ x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || Math.abs(item.transform[3]) || 10, str: item.str });
      }
      pieces.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: TextPiece[][] = [];
      for (const piece of pieces) {
        const line = lines[lines.length - 1];
        if (line && Math.abs(line[0].y - piece.y) <= Math.max(2, piece.height * 0.4)) line.push(piece);
        else lines.push([piece]);
      }
      const gaps = lines.slice(1).map((l, i) => lines[i][0].y - l[0].y);
      const typical = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0;
      lines.forEach((line, i) => {
        line.sort((a, b) => a.x - b.x);
        let text = "";
        let end = -Infinity;
        for (const piece of line) {
          const charWidth = piece.str.length ? piece.width / piece.str.length : piece.height * 0.5;
          text += text && piece.x - end > charWidth * 0.2 && !text.endsWith(" ") ? ` ${piece.str}` : piece.str;
          end = piece.x + piece.width;
        }
        if (i > 0 && typical > 0 && gaps[i - 1] > typical * 1.5) paras.push({ text: "", list: false });
        paras.push({ text, list: false });
      });
      if (p < doc.numPages) paras.push({ text: "", list: false });
      page.cleanup();
    }
  } finally {
    void doc.destroy();
  }
  if (!paras.some((p) => p.text.trim())) throw new Error("This PDF has no selectable text (it may be a scanned image). Use a Word file or a text-based PDF.");
  return { text: joinParagraphs(paras, false), notice: "Read from a PDF. Check line breaks before saving." };
}

/** Reads an email body from a Word (.docx), PDF or text file in the browser. */
export async function parseBodyDocument(file: File): Promise<BodyDocument> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_BODY_FILE_BYTES) throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 5 MB.`);
  let result: BodyDocument;
  if (name.endsWith(".doc")) throw new Error("Old .doc files are not supported. In Word use File > Save As > Word Document (.docx) or PDF.");
  else if (name.endsWith(".docx")) result = await parseDocx(file);
  else if (name.endsWith(".pdf") || file.type === "application/pdf") result = await parsePdf(file);
  else if (name.endsWith(".txt") || file.type === "text/plain") result = { text: (await file.text()).replace(/\r\n?/g, "\n").trim() };
  else throw new Error("Please upload a Word (.docx), PDF or .txt file.");
  if (!result.text.trim()) throw new Error("The document is empty.");
  return result;
}
