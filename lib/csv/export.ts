/** Neutralises spreadsheet formula injection (CSV injection) for values starting with =,+,-,@,tab,CR. */
export function escapeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function quote(value: string): string {
  const v = escapeFormula(value);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers.map((h) => quote(h)).join(",")];
  for (const row of rows) {
    lines.push(row.map((c) => quote(c === null || c === undefined ? "" : String(c))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
