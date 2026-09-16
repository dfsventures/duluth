import { describe, it, expect } from "vitest";
import { computeFundMetricsDiff, parseSheetMultiple, parseSheetPercent, type KnownFundSlug, type FundMetricsCurrentValues } from "@/lib/fund-metrics-sync";
import { parseSheetCurrency } from "@/lib/sheet-sync";

// All slugs and numbers below are synthetic (ground rule 1; Part 27/F53/F54)
// — never a real DFS fund/vehicle code, and never a real MOIC/TVPI/IRR/NAV.

describe("parseSheetMultiple", () => {
  it("strips a trailing x/× and parses the number", () => {
    expect(parseSheetMultiple("1.4x").value).toBe(1.4);
    expect(parseSheetMultiple("1.4×").value).toBe(1.4);
    expect(parseSheetMultiple("1.4").value).toBe(1.4);
  });

  it("blank -> {value:null, ok:true} (legitimate, not an error)", () => {
    expect(parseSheetMultiple("")).toEqual({ value: null, ok: true });
    expect(parseSheetMultiple(undefined)).toEqual({ value: null, ok: true });
  });

  it("garbage -> {value:null, ok:false}", () => {
    expect(parseSheetMultiple("n/a").ok).toBe(false);
  });
});

describe("parseSheetCurrency (reused from sheet-sync.ts, not reimplemented)", () => {
  it("strips $ and , ", () => {
    expect(parseSheetCurrency("$1,234").value).toBe(1234);
  });
});

// Q89 = A (LOCKED): the whole regression guard for the fraction-storage
// decision. If anyone later "simplifies" this parser to return the number
// as written for a percent-formatted cell, this test fails.
describe("parseSheetPercent (Q89 = A)", () => {
  it('"2.05%" -> 0.0205 (percent-formatted: strip % and divide by 100)', () => {
    expect(parseSheetPercent("2.05%")).toEqual({ value: 0.0205, ok: true });
  });

  it('"2.05" -> 2.05, unchanged (no %, passed through as an already-fraction per Q90)', () => {
    expect(parseSheetPercent("2.05")).toEqual({ value: 2.05, ok: true });
  });

  it('"0.0205" -> 0.0205, unchanged', () => {
    expect(parseSheetPercent("0.0205")).toEqual({ value: 0.0205, ok: true });
  });

  it("blank -> {value:null, ok:true}", () => {
    expect(parseSheetPercent("")).toEqual({ value: null, ok: true });
  });

  it("garbage -> {value:null, ok:false}", () => {
    expect(parseSheetPercent("n/a").ok).toBe(false);
  });

  it("strips commas before parsing", () => {
    expect(parseSheetPercent("1,234%")).toEqual({ value: 12.34, ok: true });
  });
});

const KNOWN_FUNDS: KnownFundSlug[] = [
  { id: "fund-veh1", slug: "VEH1" },
  { id: "fund-veh2", slug: "VEH2" },
  { id: "fund-early", slug: "EARLY" },
];

function currentValues(overrides: Record<string, Partial<FundMetricsCurrentValues>>): Record<string, FundMetricsCurrentValues> {
  const base: FundMetricsCurrentValues = { grossMoicOverride: null, netTvpiOverride: null, netIrrOverride: null, netNavOverride: null };
  const out: Record<string, FundMetricsCurrentValues> = {};
  for (const fund of KNOWN_FUNDS) out[fund.id] = { ...base, ...(overrides[fund.id] ?? {}) };
  return out;
}

// A realistic-shaped fixture: the vehicle-code row is NOT row 0 (it's found
// by content), includes two roll-up-shaped headers that must be excluded
// structurally, a garbage cell, a blank metric cell, and a deal table with
// a duplicate ID, a sheet-only ID, and a blank ID row further down.
const SHEET_VALUES: string[][] = [
  ["Fund Metrics Summary"],
  [],
  // Row 2: vehicle-code header row.
  ["Metric", "VEH1", "VEH2", "EARLY", "VEH1 + VEH2", "TOTAL"],
  // Row 3: Gross MOIC — EARLY is blank (a legitimate blank metric cell).
  ["Gross MOIC", "1.50x", "2.00x", "", "3.50x", "3.75x"],
  // Row 4: Net TVPI — VEH2's cell is garbage (a bad cell); VEH1/EARLY still update.
  ["Net TVPI", "1.20x", "abc", "0.80x", "", ""],
  // Row 5: Net IRR — the Q89/Q90 regression guard lives here.
  ["Net IRR", "2.05%", "5%", "0.03", "", ""],
  // Row 6: Net NAV — EARLY has no cell at all (undefined, not just blank string).
  ["Net NAV", "$1,000,000", "$2,500,000"],
  [],
  // Sheet-internal, out of scope by Stephen's instruction (ground rule 5) — never read.
  ["Include in CUSTOM", "TRUE", "FALSE", "TRUE"],
  [],
  // Deal table further down — a different block, located by content.
  ["#", "Stable ID column", "Company"],
  ["1", "D-0001", "Acme Co"],
  ["2", "D-0002", "Beta Co"],
  ["3", "D-0001", "Dup Co"], // duplicate of D-0001
  ["4", "", "Blank id row"], // blank id — skipped
  ["5", "D-0003", "Gamma Co"],
];

const DB_SHEET_ROW_IDS = ["D-0002", "D-0004"];

describe("computeFundMetricsDiff", () => {
  const values = currentValues({
    "fund-veh1": { grossMoicOverride: 1.0, netTvpiOverride: 1.2, netIrrOverride: 0.05, netNavOverride: 500_000 },
    "fund-veh2": { grossMoicOverride: 2.0, netTvpiOverride: null, netIrrOverride: null, netNavOverride: 2_500_000 },
    "fund-early": { grossMoicOverride: 5.0, netTvpiOverride: 0.75, netIrrOverride: 0.03, netNavOverride: null },
  });
  const diff = computeFundMetricsDiff(SHEET_VALUES, KNOWN_FUNDS, DB_SHEET_ROW_IDS, values);

  it("locates the vehicle-code row below row 0 and excludes roll-up-shaped headers", () => {
    expect(diff.errors.unmatchedColumns).toEqual(expect.arrayContaining(["VEH1 + VEH2", "TOTAL"]));
    // The substring-matching regression test: no update ever references a
    // roll-up header as if it were a fund.
    expect(diff.updates.every((u) => u.slug !== "VEH1 + VEH2" && u.slug !== "TOTAL")).toBe(true);
  });

  it("a blank metric cell produces to: null, not an error", () => {
    const u = diff.updates.find((u) => u.slug === "EARLY" && u.field === "grossMoicOverride");
    expect(u).toEqual({ fundId: "fund-early", slug: "EARLY", field: "grossMoicOverride", from: 5.0, to: null });
  });

  it("garbage in a metric cell -> badCells, no update for that cell, other funds in the same row still update", () => {
    expect(diff.errors.badCells).toContainEqual({ fundSlug: "VEH2", metric: "Net TVPI", value: "abc" });
    expect(diff.updates.find((u) => u.slug === "VEH2" && u.field === "netTvpiOverride")).toBeUndefined();
    // VEH1 is unchanged (1.2 -> 1.2) so no update either, but EARLY's Net
    // TVPI genuinely changes (0.75 -> 0.8) proving the row wasn't abandoned.
    expect(diff.updates).toContainEqual({ fundId: "fund-early", slug: "EARLY", field: "netTvpiOverride", from: 0.75, to: 0.8 });
  });

  it("unchanged values emit no update", () => {
    expect(diff.updates.find((u) => u.slug === "VEH1" && u.field === "netTvpiOverride")).toBeUndefined();
    expect(diff.updates.find((u) => u.slug === "VEH2" && u.field === "grossMoicOverride")).toBeUndefined();
    expect(diff.updates.find((u) => u.slug === "VEH2" && u.field === "netNavOverride")).toBeUndefined();
    expect(diff.updates.find((u) => u.slug === "EARLY" && u.field === "netIrrOverride")).toBeUndefined();
  });

  // Q89/Q90 cross-layer guard: the diff layer must leave the parser's
  // fraction conversion alone, not re-derive or re-scale it.
  it("Q89 cross-layer guard: a '2.05%' cell produces to: 0.0205, not 2.05", () => {
    expect(diff.updates).toContainEqual({ fundId: "fund-veh1", slug: "VEH1", field: "netIrrOverride", from: 0.05, to: 0.0205 });
  });

  it("a bare '0.03' Net IRR cell (no %) is unchanged (already a fraction)", () => {
    // fund-early's current netIrrOverride is already 0.03, so no update —
    // but this also proves the parser didn't misread it as 3.
    expect(diff.updates.find((u) => u.slug === "EARLY" && u.field === "netIrrOverride")).toBeUndefined();
  });

  it("crosscheck: sheet-only id, molly-only id, duplicate sheet id", () => {
    expect(diff.crosscheck.duplicateSheetIds).toEqual(["D-0001"]);
    expect(diff.crosscheck.sheetOnlyIds.sort()).toEqual(["D-0001", "D-0003"]);
    expect(diff.crosscheck.mollyOnlyIds).toEqual(["D-0004"]);
  });

  it("structural guard (D2/JC-FM-D): no update's field is netDpiOverride, and no show* key appears anywhere in the diff", () => {
    for (const u of diff.updates) {
      expect(u.field).not.toBe("netDpiOverride");
      expect(Object.keys(u)).not.toContain("showGrossMoic");
      expect(Object.keys(u)).not.toContain("showNetTvpi");
      expect(Object.keys(u)).not.toContain("showNetIrr");
      expect(Object.keys(u)).not.toContain("showNetNav");
    }
    expect(JSON.stringify(diff)).not.toMatch(/netDpiOverride|showGrossMoic|showNetTvpi|showNetIrr|showNetNav/);
  });

  it("never references 'Include in CUSTOM' anywhere in errors/updates (ground rule 5)", () => {
    expect(JSON.stringify(diff)).not.toMatch(/Include in CUSTOM/i);
  });
});

describe("computeFundMetricsDiff — a missing metric row", () => {
  it("a missing metric row label -> errors.missingRows and ZERO updates for that metric across all funds", () => {
    const valuesMissingNav: string[][] = [
      ["Metric", "VEH1", "VEH2"],
      ["Gross MOIC", "1.0x", "2.0x"],
      ["Net TVPI", "1.0x", "2.0x"],
      ["Net IRR", "0.05", "0.06"],
      // No Net NAV row at all.
    ];
    const cv = currentValues({
      "fund-veh1": { netNavOverride: 999_999 },
      "fund-veh2": { netNavOverride: 888_888 },
    });
    const diff = computeFundMetricsDiff(valuesMissingNav, KNOWN_FUNDS, [], cv);
    expect(diff.errors.missingRows).toContain("Net NAV");
    expect(diff.updates.find((u) => u.field === "netNavOverride")).toBeUndefined();
  });
});
