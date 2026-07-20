// Part 10, WS27.3 — pure diff engine behind the one-way Google Sheets sync
// (Q22-B). No DB or network access in this file — same extraction pattern
// as route-access.ts / share-metrics.ts / portfolio-metrics.ts, fully
// unit-testable on synthetic rows (ground rule 1).
//
// Corrected sheet structure (2026-07-20, verified against the live
// production sheet — the Part 10 plan text had inherited the WRONG layout
// from the original Excel file; see docs/IMPLEMENTATION_PLAN.md's WS27
// section for the full correction): tab "All Deals", header at row 1, data
// starting row 2. Columns are looked up by header TEXT, not fixed letters,
// so a go-forward round-size/ownership column (Q24 — not yet added) is
// picked up automatically once it exists and skipped cleanly while it
// doesn't (Q24 gate #3).

import { findColumn } from "@/lib/sheets";
import type { SheetTable } from "@/lib/sheets";

const INVESTMENT_TYPE_MAP: Record<string, string> = {
  initial: "INITIAL",
  "follow-on": "FOLLOW_ON",
  "follow on": "FOLLOW_ON",
};

// Keyed on the month name's first 3 letters, so both abbreviated ("Nov")
// and full ("November") forms resolve identically — the live sheet
// genuinely mixes both across its 76 rows (different people typed dates
// differently over time; confirmed 2026-07-20 by reading the sheet
// directly: 56 rows abbreviated, 20 full). A month-keyed-by-full-name-only
// lookup silently dropped every abbreviated row from both this sync and
// the one-time linking step (src/lib/sheet-link.ts) — "May" was the only
// month that accidentally worked, since its abbreviated and full forms
// are identical, which is what made the bug look like a 27/49 split
// instead of an obvious total failure.
const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parses the sheet's "May 8, 2019" / "Nov 9, 2019" date-string format (both abbreviated and full month names). Deliberately not `new Date(string)` (locale/engine-dependent) — an explicit, testable parser. */
export function parseSheetDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
  if (month === undefined) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month, day));
}

export interface ParsedCurrency {
  value: number | null; // null = intentionally blank (not an error)
  ok: boolean; // false = garbage text that couldn't be parsed (a bad cell)
}

/** Parses currency strings like "$150,000" by stripping $ and , — house convention per the plan. Blank cell -> {value:null, ok:true} (not an error, e.g. valuation columns are often legitimately empty). */
export function parseSheetCurrency(raw: string | undefined): ParsedCurrency {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { value: null, ok: true };
  const stripped = trimmed.replace(/[$,]/g, "");
  const num = Number(stripped);
  if (!Number.isFinite(num)) return { value: null, ok: false };
  return { value: num, ok: true };
}

export interface KnownFund {
  id: string;
  name: string;
}

export interface KnownCompany {
  id: string;
  name: string;
}

export interface DbDealForSync {
  id: string;
  sheetRowId: string | null;
  investmentType: string;
  dealDate: Date;
  country: string | null;
  amountUsd: number;
  instrument: string | null;
  entryValuation: number | null;
  currentValuation: number | null;
  notes: string | null;
}

export interface SheetDealCreate {
  sheetRowId: string;
  companyName: string;
  portfolioCompanyId: string | null; // null => needs auto-create (flagged in newCompanies, JC19)
  fundId: string;
  investmentType: string;
  dealDate: Date;
  country: string | null;
  amountUsd: number;
  instrument: string | null;
  entryValuation: number | null;
  currentValuation: number | null;
  notes: string | null;
}

export interface SheetFieldUpdate {
  sheetRowId: string;
  dealId: string;
  field: string;
  from: unknown;
  to: unknown;
}

export interface SheetDiff {
  creates: SheetDealCreate[];
  updates: SheetFieldUpdate[];
  newCompanies: string[];
  errors: {
    duplicateIds: string[];
    missingIds: number[]; // 1-based sheet row numbers
    unknownVehicles: { row: number; vehicle: string }[];
    badCells: { row: number; column: string; value: string }[];
  };
}

function emptyDiff(): SheetDiff {
  return { creates: [], updates: [], newCompanies: [], errors: { duplicateIds: [], missingIds: [], unknownVehicles: [], badCells: [] } };
}

/**
 * Computes the one-way diff (Sheet -> Molly) for the "All Deals" tab.
 * Never mutates anything — pure. Identity is the Stable ID column value,
 * NOT row position, so reordering the sheet produces zero diff (JC19/Q26).
 * Duplicate/missing IDs and unknown vehicles become errors, not mutations.
 */
export function computeSheetDiff(sheet: SheetTable, dbDeals: DbDealForSync[], knownFunds: KnownFund[], knownCompanies: KnownCompany[]): SheetDiff {
  const diff = emptyDiff();
  const { header, rows } = sheet;

  const idCol = findColumn(header, "Stable ID column");
  const companyCol = findColumn(header, "Company");
  const vehicleCol = findColumn(header, "Vehicle");
  const investmentCol = findColumn(header, "Investment");
  const dateCol = findColumn(header, "Date");
  const countryCol = findColumn(header, "Country");
  const amountCol = findColumn(header, "Amount");
  const instrumentCol = findColumn(header, "Instrument");
  const entryValCol = findColumn(header, "Valuation/\nCap (post)");
  const currentValCol = findColumn(header, "Current Valuation");
  const notesCol = findColumn(header, "Notes");
  // Round-size/ownership columns: not yet added to the sheet (Q24 gate #3).
  // These header names are placeholders — when the team names the real
  // go-forward columns, update these two lines only; findColumn returns -1
  // (skipped cleanly) until then, so this never blocks or errors.
  const roundSizeCol = findColumn(header, "Round Size");
  const ownershipCol = findColumn(header, "Ownership %");
  void roundSizeCol;
  void ownershipCol; // not yet consumed — reserved for when Q24's columns land

  const dealsBySheetRowId = new Map(dbDeals.filter((d) => d.sheetRowId).map((d) => [d.sheetRowId as string, d]));

  // Pass 1: find duplicate IDs across the whole sheet (identity integrity first).
  const idCounts = new Map<string, number>();
  rows.forEach((row) => {
    const id = (row[idCol] ?? "").trim();
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  });
  const duplicateIds = new Set([...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  diff.errors.duplicateIds = [...duplicateIds];

  const seenNewCompanies = new Set<string>();

  rows.forEach((row, i) => {
    const sheetRow = i + 2; // header is row 1, data starts row 2
    const id = (row[idCol] ?? "").trim();

    if (!id) {
      diff.errors.missingIds.push(sheetRow);
      return;
    }
    if (duplicateIds.has(id)) {
      return; // already reported once in errors.duplicateIds; never mutate on ambiguous identity
    }

    const vehicleName = (row[vehicleCol] ?? "").trim();
    const fund = knownFunds.find((f) => f.name.trim().toLowerCase() === vehicleName.toLowerCase());
    if (!fund) {
      diff.errors.unknownVehicles.push({ row: sheetRow, vehicle: vehicleName });
      return;
    }

    const companyName = (row[companyCol] ?? "").trim();
    const company = knownCompanies.find((c) => c.name === companyName);

    const investmentRaw = (row[investmentCol] ?? "").trim();
    const investmentType = INVESTMENT_TYPE_MAP[investmentRaw.toLowerCase()];
    if (!investmentType) {
      diff.errors.badCells.push({ row: sheetRow, column: "Investment", value: investmentRaw });
      return;
    }

    const dealDate = parseSheetDate(row[dateCol]);
    if (!dealDate) {
      diff.errors.badCells.push({ row: sheetRow, column: "Date", value: row[dateCol] ?? "" });
      return;
    }

    const amount = parseSheetCurrency(row[amountCol]);
    if (!amount.ok || amount.value === null) {
      diff.errors.badCells.push({ row: sheetRow, column: "Amount", value: row[amountCol] ?? "" });
      return;
    }

    const entryVal = parseSheetCurrency(row[entryValCol]);
    if (!entryVal.ok) {
      diff.errors.badCells.push({ row: sheetRow, column: "Valuation/Cap (post)", value: row[entryValCol] ?? "" });
      return;
    }
    const currentVal = parseSheetCurrency(row[currentValCol]);
    if (!currentVal.ok) {
      diff.errors.badCells.push({ row: sheetRow, column: "Current Valuation", value: row[currentValCol] ?? "" });
      return;
    }

    const country = (row[countryCol] ?? "").trim() || null;
    const instrument = (row[instrumentCol] ?? "").trim() || null;
    const notes = (row[notesCol] ?? "").trim() || null;

    const existing = dealsBySheetRowId.get(id);
    if (existing) {
      const candidates: { field: string; from: unknown; to: unknown }[] = [
        { field: "investmentType", from: existing.investmentType, to: investmentType },
        { field: "dealDate", from: existing.dealDate.toISOString(), to: dealDate.toISOString() },
        { field: "country", from: existing.country, to: country },
        { field: "amountUsd", from: existing.amountUsd, to: amount.value },
        { field: "instrument", from: existing.instrument, to: instrument },
        { field: "entryValuation", from: existing.entryValuation, to: entryVal.value },
        { field: "currentValuation", from: existing.currentValuation, to: currentVal.value },
        { field: "notes", from: existing.notes, to: notes },
      ];
      for (const c of candidates) {
        if (c.from !== c.to) {
          diff.updates.push({ sheetRowId: id, dealId: existing.id, field: c.field, from: c.from, to: c.to });
        }
      }
    } else {
      diff.creates.push({
        sheetRowId: id,
        companyName,
        portfolioCompanyId: company?.id ?? null,
        fundId: fund.id,
        investmentType,
        dealDate,
        country,
        amountUsd: amount.value,
        instrument,
        entryValuation: entryVal.value,
        currentValuation: currentVal.value,
        notes,
      });
      if (!company && !seenNewCompanies.has(companyName)) {
        seenNewCompanies.add(companyName);
        diff.newCompanies.push(companyName);
      }
    }
  });

  return diff;
}
