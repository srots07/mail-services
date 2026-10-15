import { isValidEmail, sanitizeCell } from "@/lib/csv/validate";
import type { BulkMapping } from "./fields";

export const MAX_BULK_ROWS = 10_000;
const MAX_EXTRA_COLUMNS = 30;

export interface BulkRow {
  rowNumber: number;
  companyName: string;
  toName: string;
  fromName: string;
  /** Lowercased and trimmed. */
  email: string | null;
  /** Unmapped columns (header -> trimmed value), given to the AI as extra details. */
  extra: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface BulkValidation {
  rows: BulkRow[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    withWarnings: number;
    duplicateEmails: number;
    duplicateRows: number;
  };
}

const cell = (raw: Record<string, string>, col: string, max: number) => (col ? sanitizeCell(raw[col], max) : "");

/**
 * Validates a contact file. Errors block a row (it is not imported); warnings are shown but the row is
 * imported. Nothing is corrected silently: values are trimmed only and emails lowercased.
 */
export function validateBulkRows(rawRows: Record<string, string>[], mapping: BulkMapping): BulkValidation {
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const seenRows = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const summary = { total: rawRows.length, valid: 0, invalid: 0, withWarnings: 0, duplicateEmails: 0, duplicateRows: 0 };

  const rows = rawRows.slice(0, MAX_BULK_ROWS).map((raw, i): BulkRow => {
    const rowNumber = i + 2;
    const companyName = cell(raw, mapping.company_name, 300);
    const toName = cell(raw, mapping.to_name, 200);
    const fromName = cell(raw, mapping.from_name, 200);
    const emailRaw = cell(raw, mapping.email, 320);
    const errors: string[] = [];
    const warnings: string[] = [];
    const extra: Record<string, string> = {};
    for (const [header, value] of Object.entries(raw)) {
      if (mapped.has(header) || Object.keys(extra).length >= MAX_EXTRA_COLUMNS) continue;
      const v = sanitizeCell(value, 30000);
      if (v) extra[header.slice(0, 100)] = v;
    }

    if (!companyName) errors.push("Company name is empty");
    if (!toName) errors.push("To name is empty");
    if (!fromName && mapping.from_name) warnings.push("From name is empty: the sender profile name is used");

    const rowKey = JSON.stringify([companyName.toLowerCase(), toName.toLowerCase(), emailRaw.toLowerCase()]);
    const firstRow = seenRows.get(rowKey);
    if (firstRow) {
      errors.push(`Duplicate of row ${firstRow}`);
      summary.duplicateRows++;
    } else seenRows.set(rowKey, rowNumber);

    let email: string | null = null;
    if (!emailRaw) errors.push("Email is empty");
    else if (!isValidEmail(emailRaw)) errors.push(`Invalid email format "${emailRaw.slice(0, 100)}"`);
    else {
      email = emailRaw.toLowerCase();
      const firstEmail = seenEmails.get(email);
      if (firstEmail && !firstRow) {
        errors.push(`Duplicate email (also on row ${firstEmail})`);
        summary.duplicateEmails++;
      } else if (!firstEmail) seenEmails.set(email, rowNumber);
    }

    if (errors.length) summary.invalid++;
    else summary.valid++;
    if (warnings.length) summary.withWarnings++;
    return { rowNumber, companyName, toName, fromName, email, extra, errors, warnings };
  });
  return { rows, summary };
}
