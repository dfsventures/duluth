// Part 36, WS102.2 — pure diff engine behind the second, independent
// one-way Google Sheets sync (D1). No `db` or `fetch` in this file — same
// extraction discipline as sheet-sync.ts, fully unit-testable on synthetic
// rows (ground rule 1: no real vehicle code or metric value anywhere here).
//
// Unlike `sheet-sync.ts`, which matches the deals sheet's `Vehicle` cell
// against `Fund.name`, this module matches the summary block's column
// headers against `Fund.slug`. The difference is deliberate — these
// headers are vehicle codes, and `slug` is the immutable import key
// (`schema.prisma:530`, `api/admin/funds/[id]/route.ts:146`). See Part
// 36/F97; do not "harmonize" the two.

import { parseSheetCurrency, type ParsedCurrency } from "@/lib/sheet-sync";

export type { ParsedCurrency };

/** Parses "1.4x" / "1.4×" / "1.4" -> 1.4. Blank cell -> {value:null, ok:true} (a blank metric cell is legitimate, not a bad cell). */
export function parseSheetMultiple(raw: string | undefined): ParsedCurrency {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { value: null, ok: true };
  const stripped = trimmed.replace(/[x×]$/i, "").trim();
  const num = Number(stripped);
  if (!Number.isFinite(num)) return { value: null, ok: false };
  return { value: num, ok: true };
}

/**
 * Returns a FRACTION (Q89 = A, LOCKED). 0.0205 means 2.05%.
 *
 * Q90: the % sign is the signal. Sheets' default FORMATTED_VALUE render
 * gives a percent-formatted cell as "2.05%", so a trailing % means the
 * number is in percent units and must be divided by 100. A bare number is
 * taken AS ALREADY A FRACTION and passed through untouched. That is the
 * only reading that cannot silently corrupt a correctly-percent-formatted
 * sheet, and it is deterministic from the cell text.
 *
 * The one case it gets wrong: a cell displaying a bare "2.05" that MEANS
 * 2.05%. That is unfalsifiable from the text and MUST be checked by eye on
 * the first dry run (see the handoff). Symptom: an IRR two orders of
 * magnitude too small in the from -> to list.
 */
export function parseSheetPercent(raw: string | undefined): ParsedCurrency {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { value: null, ok: true };
  const withoutCommas = trimmed.replace(/,/g, "");
  const isPercent = withoutCommas.endsWith("%");
  const numericPart = isPercent ? withoutCommas.slice(0, -1).trim() : withoutCommas;
  const num = Number(numericPart);
  if (!Number.isFinite(num)) return { value: null, ok: false };
  // Q89 = A (LOCKED): "2.05%" -> divide by 100 -> 0.0205. This is the
  // SINGLE point in the entire feature where a unit conversion occurs — do
  // not "simplify" this away. See Part 36/Q89 in docs/IMPLEMENTATION_PLAN.md.
  // Rounded to 10 decimal places: plain `num / 100` produces IEEE-754 noise
  // (2.05 / 100 === 0.020499999999999997) that would otherwise get written
  // to a Decimal column verbatim and make an unchanged value look changed
  // on every subsequent sync run.
  return { value: isPercent ? Math.round((num / 100) * 1e10) / 1e10 : num, ok: true };
}

export interface KnownFundSlug {
  id: string;
  slug: string;
}

export interface FundMetricsUpdate {
  fundId: string;
  slug: string;
  field: "grossMoicOverride" | "netTvpiOverride" | "netIrrOverride" | "netNavOverride";
  from: number | null;
  to: number | null;
}

export interface FundMetricsDiff {
  updates: FundMetricsUpdate[];
  crosscheck: {
    sheetOnlyIds: string[]; // Stable IDs in the sheet with no matching Deal.sheetRowId
    mollyOnlyIds: string[]; // Deal.sheetRowId values absent from the sheet
    duplicateSheetIds: string[];
  };
  errors: {
    unmatchedColumns: string[]; // vehicle-code headers with no Fund.slug — roll-ups land here and are EXPECTED
    missingRows: string[]; // a metric row label that wasn't found at all
    badCells: { fundSlug: string; metric: string; value: string }[];
  };
}

export interface FundMetricsCurrentValues {
  grossMoicOverride: number | null;
  netTvpiOverride: number | null;
  netIrrOverride: number | null;
  netNavOverride: number | null;
}

function norm(cell: string | undefined): string {
  return (cell ?? "").trim().toLowerCase();
}

// Q88-A: metrics only. This four-member union is the compile-time guard —
// do not widen it "for later" to firstDealDate/aumUsd/anything else.
const METRIC_ROW_SPECS: {
  label: string; // exact display label as it appears in column A
  field: FundMetricsUpdate["field"];
  parser: (raw: string | undefined) => ParsedCurrency;
}[] = [
  { label: "Gross MOIC", field: "grossMoicOverride", parser: parseSheetMultiple },
  { label: "Net TVPI", field: "netTvpiOverride", parser: parseSheetMultiple },
  { label: "Net IRR", field: "netIrrOverride", parser: parseSheetPercent },
  { label: "Net NAV", field: "netNavOverride", parser: parseSheetCurrency },
];

function emptyDiff(): FundMetricsDiff {
  return {
    updates: [],
    crosscheck: { sheetOnlyIds: [], mollyOnlyIds: [], duplicateSheetIds: [] },
    errors: { unmatchedColumns: [], missingRows: [], badCells: [] },
  };
}

/**
 * Computes the one-way diff (fund-metrics sheet -> Molly Fund columns).
 * Never mutates anything — pure. Every step below is deliberate; see the
 * inline comments and Part 36/WS102.2 in docs/IMPLEMENTATION_PLAN.md for
 * the full reasoning.
 */
export function computeFundMetricsDiff(
  values: string[][],
  knownFunds: KnownFundSlug[],
  dbSheetRowIds: string[],
  currentValues: Record<string, FundMetricsCurrentValues>
): FundMetricsDiff {
  const diff = emptyDiff();

  const slugToFund = new Map(knownFunds.map((f) => [f.slug.trim().toLowerCase(), f]));

  // Step 1: find the vehicle-code row — the first row with two or more
  // cells that exactly match (trimmed, case-insensitive) a Fund.slug.
  // Requiring two prevents a stray cell elsewhere in the sheet from being
  // mistaken for it.
  let headerRow: string[] | undefined;
  for (const row of values) {
    const matchCount = row.filter((cell) => slugToFund.has(norm(cell))).length;
    if (matchCount >= 2) {
      headerRow = row;
      break;
    }
  }

  // Step 2: build the column map. Exact, trimmed, case-insensitive equality
  // against Fund.slug — never `includes`/`startsWith` (a "VEH1 + VEH2"
  // roll-up header would otherwise match every vehicle it names and write
  // one column's figure onto several funds). Unmatched, non-blank headers
  // are recorded as expected, not alarming (the sheet's roll-up/total/
  // CUSTOM columns structurally never match a real Fund.slug).
  const columnMap = new Map<string, number>(); // slug (lowercased) -> column index
  const unmatchedColumns = new Set<string>();
  if (headerRow) {
    headerRow.forEach((cell, colIndex) => {
      const cleaned = (cell ?? "").trim();
      if (!cleaned) return;
      const key = norm(cell);
      if (slugToFund.has(key)) {
        columnMap.set(key, colIndex);
      } else {
        unmatchedColumns.add(cleaned);
      }
    });
  }
  diff.errors.unmatchedColumns = [...unmatchedColumns];

  // Step 3 + 4: find each metric row by column-A label text, then emit an
  // update per (fund, metric) where the parsed value differs from Molly's
  // current value. A metric row that isn't found at all is skipped for
  // EVERY fund (errors.missingRows) — never written as null, since a
  // missing row must never blank a column.
  for (const spec of METRIC_ROW_SPECS) {
    const rowIndex = values.findIndex((row) => norm(row[0]) === spec.label.toLowerCase());
    if (rowIndex === -1) {
      diff.errors.missingRows.push(spec.label);
      continue;
    }
    const row = values[rowIndex] ?? [];
    for (const [slugKey, colIndex] of columnMap) {
      const fund = slugToFund.get(slugKey)!;
      const raw = row[colIndex];
      const parsed = spec.parser(raw);
      if (!parsed.ok) {
        diff.errors.badCells.push({ fundSlug: fund.slug, metric: spec.label, value: raw ?? "" });
        continue;
      }
      const current = currentValues[fund.id]?.[spec.field] ?? null;
      if (parsed.value !== current) {
        diff.updates.push({ fundId: fund.id, slug: fund.slug, field: spec.field, from: current, to: parsed.value });
      }
    }
  }

  // Step 5: crosscheck (D6). Find the deal-table header row (a row
  // containing a cell matching "Stable ID column"), collect that column's
  // non-blank values below it, and set-difference against Molly's
  // Deal.sheetRowId values. Values are never read from the deal table below
  // that row — only the ID column.
  let idRowIndex = -1;
  let idColIndex = -1;
  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    const c = row.findIndex((cell) => norm(cell) === "stable id column");
    if (c !== -1) {
      idRowIndex = r;
      idColIndex = c;
      break;
    }
  }
  if (idRowIndex !== -1) {
    const sheetIds: string[] = [];
    for (let r = idRowIndex + 1; r < values.length; r++) {
      const id = (values[r]?.[idColIndex] ?? "").trim();
      if (id) sheetIds.push(id);
    }
    const idCounts = new Map<string, number>();
    for (const id of sheetIds) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    diff.crosscheck.duplicateSheetIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);

    const sheetIdSet = new Set(sheetIds);
    const dbIdSet = new Set(dbSheetRowIds);
    diff.crosscheck.sheetOnlyIds = [...sheetIdSet].filter((id) => !dbIdSet.has(id));
    diff.crosscheck.mollyOnlyIds = dbSheetRowIds.filter((id) => !sheetIdSet.has(id));
  }

  return diff;
}
