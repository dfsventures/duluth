import { describe, it, expect } from "vitest";
import { computeSheetDiff, parseSheetDate, parseSheetCurrency } from "@/lib/sheet-sync";
import type { SheetTable } from "@/lib/sheets";

// All company/fund/deal names below are synthetic (ground rule 1) — never
// derived from the real spreadsheet or production data.

const HEADER = [
  "#",
  "Stable ID column",
  "Company",
  "Vehicle",
  "Investment",
  "Date",
  "Country",
  "Amount",
  "Instrument",
  "Valuation/\nCap (post)",
  "Current Valuation",
  "Markups*",
  "Implied Value",
  "Notes",
];

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    "#": "1",
    "Stable ID column": "D-0001",
    Company: "Acme Robotics",
    Vehicle: "Test Fund I",
    Investment: "Initial",
    Date: "May 8, 2019",
    Country: "Kenya",
    Amount: "$150,000",
    Instrument: "SAFE",
    "Valuation/\nCap (post)": "$3,000,000",
    "Current Valuation": "$9,000,000",
    "Markups*": "3",
    "Implied Value": "$450,000",
    Notes: "",
  };
  const merged = { ...base, ...overrides };
  return HEADER.map((h) => merged[h] ?? "");
}

const FUNDS = [{ id: "fund-1", name: "Test Fund I" }];
const COMPANIES = [{ id: "co-1", name: "Acme Robotics" }];

describe("parseSheetDate", () => {
  it("parses 'Month D, YYYY'", () => {
    expect(parseSheetDate("May 8, 2019")?.toISOString()).toBe("2019-05-08T00:00:00.000Z");
    expect(parseSheetDate("December 31, 2025")?.toISOString()).toBe("2025-12-31T00:00:00.000Z");
  });

  it("returns null for garbage or empty input", () => {
    expect(parseSheetDate("not a date")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate(undefined)).toBeNull();
  });
});

describe("parseSheetCurrency", () => {
  it("strips $ and , and parses", () => {
    expect(parseSheetCurrency("$150,000")).toEqual({ value: 150000, ok: true });
    expect(parseSheetCurrency("$3,000,000")).toEqual({ value: 3000000, ok: true });
  });

  it("blank cell is not an error", () => {
    expect(parseSheetCurrency("")).toEqual({ value: null, ok: true });
    expect(parseSheetCurrency(undefined)).toEqual({ value: null, ok: true });
  });

  it("garbage text is a bad cell", () => {
    expect(parseSheetCurrency("n/a")).toEqual({ value: null, ok: false });
  });
});

describe("computeSheetDiff", () => {
  it("a brand-new sheet row (no matching sheetRowId) becomes a create", () => {
    const sheet: SheetTable = { header: HEADER, rows: [row()] };
    const diff = computeSheetDiff(sheet, [], FUNDS, COMPANIES);
    expect(diff.creates).toHaveLength(1);
    expect(diff.creates[0]).toMatchObject({
      sheetRowId: "D-0001",
      companyName: "Acme Robotics",
      portfolioCompanyId: "co-1",
      fundId: "fund-1",
      investmentType: "INITIAL",
      amountUsd: 150000,
      entryValuation: 3000000,
      currentValuation: 9000000,
    });
    expect(diff.newCompanies).toEqual([]);
    expect(diff.errors).toEqual({ duplicateIds: [], missingIds: [], unknownVehicles: [], badCells: [] });
  });

  it("flags an unrecognized company name as a new company on the create", () => {
    const sheet: SheetTable = { header: HEADER, rows: [row({ Company: "Brand New Co" })] };
    const diff = computeSheetDiff(sheet, [], FUNDS, COMPANIES);
    expect(diff.creates[0].portfolioCompanyId).toBeNull();
    expect(diff.newCompanies).toEqual(["Brand New Co"]);
  });

  it("reorder-invariance: sheet row order does not affect the diff (identity is the ID, not position)", () => {
    const sheetA: SheetTable = {
      header: HEADER,
      rows: [row({ "Stable ID column": "D-0001" }), row({ "Stable ID column": "D-0002", Company: "Second Co" })],
    };
    const sheetB: SheetTable = {
      header: HEADER,
      rows: [row({ "Stable ID column": "D-0002", Company: "Second Co" }), row({ "Stable ID column": "D-0001" })],
    };
    const companies = [...COMPANIES, { id: "co-2", name: "Second Co" }];
    const diffA = computeSheetDiff(sheetA, [], FUNDS, companies);
    const diffB = computeSheetDiff(sheetB, [], FUNDS, companies);
    const sortById = (d: typeof diffA) => [...d.creates].sort((a, b) => a.sheetRowId.localeCompare(b.sheetRowId));
    expect(sortById(diffA)).toEqual(sortById(diffB));
  });

  it("duplicate ID across rows -> error, not a mutation", () => {
    const sheet: SheetTable = {
      header: HEADER,
      rows: [row({ "Stable ID column": "D-0001" }), row({ "Stable ID column": "D-0001", Company: "Different Co" })],
    };
    const diff = computeSheetDiff(sheet, [], FUNDS, COMPANIES);
    expect(diff.errors.duplicateIds).toEqual(["D-0001"]);
    expect(diff.creates).toEqual([]);
  });

  it("missing ID -> error with a 1-based sheet row number, not a mutation", () => {
    const sheet: SheetTable = { header: HEADER, rows: [row({ "Stable ID column": "" })] };
    const diff = computeSheetDiff(sheet, [], FUNDS, COMPANIES);
    expect(diff.errors.missingIds).toEqual([2]); // header is row 1, first data row is row 2
    expect(diff.creates).toEqual([]);
  });

  it("unknown vehicle -> error, not a mutation (JC19: never destructive, never invents a fund)", () => {
    const sheet: SheetTable = { header: HEADER, rows: [row({ Vehicle: "Nonexistent Fund" })] };
    const diff = computeSheetDiff(sheet, [], FUNDS, COMPANIES);
    expect(diff.errors.unknownVehicles).toEqual([{ row: 2, vehicle: "Nonexistent Fund" }]);
    expect(diff.creates).toEqual([]);
  });

  it("bad Investment cell -> badCells error, not a mutation", () => {
    const sheet: SheetTable = { header: HEADER, rows: [row({ Investment: "Sideways" })] };
    const diff = computeSheetDiff(sheet, [], FUNDS, COMPANIES);
    expect(diff.errors.badCells).toEqual([{ row: 2, column: "Investment", value: "Sideways" }]);
    expect(diff.creates).toEqual([]);
  });

  it("a single valuation change against an existing deal produces one field-level update", () => {
    const existingDeal = {
      id: "deal-1",
      sheetRowId: "D-0001",
      investmentType: "INITIAL",
      dealDate: new Date("2019-05-08T00:00:00.000Z"),
      country: "Kenya",
      amountUsd: 150000,
      instrument: "SAFE",
      entryValuation: 3000000,
      currentValuation: 6000000, // sheet says 9,000,000 -> should produce exactly one update
      notes: null,
    };
    const sheet: SheetTable = { header: HEADER, rows: [row()] };
    const diff = computeSheetDiff(sheet, [existingDeal], FUNDS, COMPANIES);
    expect(diff.creates).toEqual([]);
    expect(diff.updates).toEqual([{ sheetRowId: "D-0001", dealId: "deal-1", field: "currentValuation", from: 6000000, to: 9000000 }]);
  });

  it("an existing deal with no field changes produces zero diff", () => {
    const existingDeal = {
      id: "deal-1",
      sheetRowId: "D-0001",
      investmentType: "INITIAL",
      dealDate: new Date("2019-05-08T00:00:00.000Z"),
      country: "Kenya",
      amountUsd: 150000,
      instrument: "SAFE",
      entryValuation: 3000000,
      currentValuation: 9000000,
      notes: null,
    };
    const sheet: SheetTable = { header: HEADER, rows: [row()] };
    const diff = computeSheetDiff(sheet, [existingDeal], FUNDS, COMPANIES);
    expect(diff.creates).toEqual([]);
    expect(diff.updates).toEqual([]);
  });
});
