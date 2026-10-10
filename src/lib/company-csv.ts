// Parses the Companies import CSV (a "name" column, an optional "url" column).
// Extracted from the Companies page in UI overhaul phase 3 so the import dialog
// can preview rows before anything is sent, and so it can be unit-tested.

export interface CompanyCsvRow {
  name: string;
  website: string | null;
}

export function parseCompanyCsv(text: string): CompanyCsvRow[] {
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const nameIdx = headers.findIndex((h) => h === "name" || h === "company name" || h === "company");
  const urlIdx = headers.findIndex((h) => h === "url" || h === "website" || h === "website url");
  if (nameIdx === -1) return [];

  const rows: CompanyCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const name = cols[nameIdx]?.trim();
    if (!name) continue;
    const website = urlIdx !== -1 ? cols[urlIdx]?.trim() || null : null;
    rows.push({ name, website });
  }
  return rows;
}
