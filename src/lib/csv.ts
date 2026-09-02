// Part 30, WS70.2 — minimal RFC4180-ish field splitter: honors double-quoted
// fields, "" as an escaped quote, and commas inside quotes. Pure, no
// dependency (the `xlsx` package is for the one-off CLI importer only, never
// shipped to the browser). Same posture as share-metrics.ts/report-snapshot.ts.
//
// The existing companies-page importer's `parseCSV` splits on bare commas,
// so a quoted cell containing a comma — `"Doe, Jane"` — silently shifts
// every column after it. This module exists so the new contacts importer
// doesn't inherit that bug. It is deliberately NOT adopted by the existing
// companies importer in this pass (out of scope — see Part 30, WS70.2).

/**
 * Splits one CSV line into fields, honoring double-quoted fields (which may
 * contain commas), `""` as an escaped literal quote inside a quoted field,
 * and a trailing empty field after a final comma.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++; // skip the escaped quote's second character
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  fields.push(current);
  return fields;
}

/** Header normalizer: strip BOM, lowercase, trim, drop surrounding quotes. */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "");
}

export interface ContactCsvRow {
  row: number; // 1-based CSV line number, carried purely so errors can name it
  company?: string;
  name?: string;
  email: string;
  role?: string;
}

// Part 30, WS70.4 — shared client-side parser for both contacts-CSV entry
// points (portfolio-wide and per-company). Mirrors the companies page's
// parseCSV header handling (BOM strip, lowercase, quote strip, alias sets)
// but is built on splitCsvLine, so a quoted "Doe, Jane" cell doesn't shift
// the row the way the companies importer's bare-comma split would.
export function parseContactsCSV(text: string): ContactCsvRow[] {
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const companyIdx = headers.findIndex((h) => ["company", "company name", "portfolio company"].includes(h));
  const nameIdx = headers.findIndex((h) => ["name", "contact", "contact name", "full name"].includes(h));
  const emailIdx = headers.findIndex((h) => ["email", "email address", "e-mail"].includes(h));
  const roleIdx = headers.findIndex((h) => ["role", "title", "position"].includes(h));

  if (emailIdx === -1) return [];

  const rows: ContactCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const email = cols[emailIdx]?.trim();
    if (!email) continue;
    rows.push({
      row: i + 1,
      company: companyIdx !== -1 ? cols[companyIdx]?.trim() || undefined : undefined,
      name: nameIdx !== -1 ? cols[nameIdx]?.trim() || undefined : undefined,
      email,
      role: roleIdx !== -1 ? cols[roleIdx]?.trim() || undefined : undefined,
    });
  }
  return rows;
}
