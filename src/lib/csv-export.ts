// CSV export for admin tables (UI overhaul phase 8). Pure, so it is unit-tested.
// Built on RFC 4180 quoting, plus a guard against spreadsheet formula injection:
// a text cell that starts with = + - @ (or a tab / CR) gets a leading apostrophe,
// so a hostile company name cannot run as a formula when an admin opens the file.

export type CsvCell = string | number | null | undefined;

export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

/** deals-2026-10-10.csv */
export function csvFilename(base: string, now: Date = new Date()): string {
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${safe}-${now.toISOString().slice(0, 10)}.csv`;
}

/** Browser-only: save the CSV (UTF-8 BOM so Excel reads accents correctly). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
