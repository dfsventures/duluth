import { describe, it, expect } from "vitest";
import { parseSheetLinkRows, matchDealsToSheetRows, type LinkableDeal } from "@/lib/sheet-link";
import type { SheetTable } from "@/lib/sheets";

// All company/fund/deal data below is synthetic (ground rule 1) — never
// derived from the real spreadsheet or production data.

const HEADER = ["#", "Stable ID column", "Company", "Vehicle", "Investment", "Date", "Country", "Amount", "Instrument", "Valuation/\nCap (post)", "Current Valuation", "Markups*", "Implied Value", "Notes"];

function sheetRow(overrides: Partial<Record<string, string>> = {}): string[] {
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

function sheet(rows: string[][]): SheetTable {
  return { header: HEADER, rows };
}

function deal(overrides: Partial<LinkableDeal> = {}): LinkableDeal {
  return {
    id: "deal-1",
    sheetRowId: null,
    companyName: "Acme Robotics",
    vehicleName: "Test Fund I",
    investmentType: "INITIAL",
    dealDate: new Date("2019-05-08T00:00:00.000Z"),
    amountUsd: 150000,
    ...overrides,
  };
}

describe("parseSheetLinkRows", () => {
  it("parses a well-formed row", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow()]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      stableId: "D-0001",
      row: 2,
      companyName: "Acme Robotics",
      vehicleName: "Test Fund I",
      investmentType: "INITIAL",
      dateKey: "2019-05-08",
      amount: 150000,
    });
  });

  it("maps Follow-On to FOLLOW_ON", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow({ Investment: "Follow-On" })]));
    expect(candidates[0].investmentType).toBe("FOLLOW_ON");
  });

  it("skips rows with no Stable ID (not this step's job to report them)", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow({ "Stable ID column": "" })]));
    expect(candidates).toHaveLength(0);
  });

  it("skips rows with an unparseable date or unrecognized Investment value", () => {
    const candidates = parseSheetLinkRows(
      sheet([sheetRow({ Date: "not a date" }), sheetRow({ "Stable ID column": "D-0002", Investment: "Bogus" })])
    );
    expect(candidates).toHaveLength(0);
  });
});

describe("matchDealsToSheetRows", () => {
  it("matches a deal to its sheet row by company/vehicle/type/date", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow()]));
    const results = matchDealsToSheetRows([deal()], candidates);
    expect(results).toEqual([{ dealId: "deal-1", companyName: "Acme Robotics", vehicleName: "Test Fund I", stableId: "D-0001", status: "matched" }]);
  });

  it("is idempotent: a deal that already has a sheetRowId is reported already-linked and never re-matched", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow()]));
    const results = matchDealsToSheetRows([deal({ sheetRowId: "D-0099" })], candidates);
    expect(results[0]).toMatchObject({ status: "already-linked", stableId: "D-0099" });
  });

  it("flags unmatched deals rather than guessing", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow()]));
    const results = matchDealsToSheetRows([deal({ id: "deal-2", companyName: "Nonexistent Co" })], candidates);
    expect(results[0].status).toBe("unmatched");
  });

  it("flags ambiguous matches when two sheet rows share the same content key, rather than guessing", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow({ "Stable ID column": "D-0001" }), sheetRow({ "Stable ID column": "D-0002" })]));
    const results = matchDealsToSheetRows([deal()], candidates);
    expect(results[0].status).toBe("ambiguous");
  });

  it("tiebreaks two same-content sheet rows using amount", () => {
    const candidates = parseSheetLinkRows(
      sheet([sheetRow({ "Stable ID column": "D-0001", Amount: "$150,000" }), sheetRow({ "Stable ID column": "D-0002", Amount: "$999,000" })])
    );
    const results = matchDealsToSheetRows([deal({ amountUsd: 150000 })], candidates);
    expect(results[0]).toMatchObject({ status: "matched", stableId: "D-0001" });
  });

  it("flags a second deal as ambiguous when it would independently claim an already-claimed stable ID", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow({ "Stable ID column": "D-0001" })]));
    const results = matchDealsToSheetRows([deal({ id: "deal-1" }), deal({ id: "deal-2" })], candidates);
    expect(results[0].status).toBe("matched");
    expect(results[1].status).toBe("ambiguous");
  });

  it("never assigns a sheetRowId on ambiguous or unmatched results", () => {
    const candidates = parseSheetLinkRows(sheet([sheetRow()]));
    const results = matchDealsToSheetRows([deal({ id: "deal-2", companyName: "Nonexistent Co" })], candidates);
    for (const r of results) {
      if (r.status === "ambiguous" || r.status === "unmatched") expect(r.stableId).toBeNull();
    }
  });
});
