import { describe, expect, it } from "vitest";
import { csvEscape, csvFilename, toCsv } from "@/lib/csv-export";

describe("csvEscape", () => {
  it("leaves plain values alone and blanks null/undefined/non-finite", () => {
    expect(csvEscape("Acme")).toBe("Acme");
    expect(csvEscape(12.5)).toBe("12.5");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(Number.NaN)).toBe("");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvEscape('Doe, "Jane"')).toBe('"Doe, ""Jane"""');
    expect(csvEscape("a\nb")).toBe('"a\nb"');
  });
  it("neutralises formula-looking text but not real negative numbers", () => {
    expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvEscape("+1")).toBe("'+1");
    expect(csvEscape("-2")).toBe("'-2");
    expect(csvEscape("@x")).toBe("'@x");
    expect(csvEscape(-2)).toBe("-2");
  });
});

describe("toCsv / csvFilename", () => {
  it("joins with CRLF and a header row", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"], [null, "z"]])).toBe('a,b\r\n1,"x,y"\r\n,z');
  });
  it("builds a dated, safe filename", () => {
    expect(csvFilename("Deal Ledger", new Date("2026-10-10T12:00:00Z"))).toBe("deal-ledger-2026-10-10.csv");
    expect(csvFilename("///", new Date("2026-10-10T12:00:00Z"))).toBe("export-2026-10-10.csv");
  });
});
