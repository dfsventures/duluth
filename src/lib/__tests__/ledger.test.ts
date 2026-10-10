import { describe, it, expect } from "vitest";
import { multipleLabel, multipleValue, summarizeLedger, type LedgerDeal } from "../ledger";

const deal = (over: Partial<LedgerDeal> = {}): LedgerDeal => ({
  amountUsd: 100_000,
  positionValue: 250_000,
  dilutionAware: false,
  fund: { id: "f1" },
  portfolioCompany: { id: "c1" },
  ...over,
});

describe("multiple", () => {
  it("is positionValue over amount", () => {
    expect(multipleValue(deal())).toBe(2.5);
    expect(multipleLabel(deal())).toBe("2.5×");
  });
  it("is n/a without a position value or a positive amount", () => {
    expect(multipleLabel(deal({ positionValue: null }))).toBe("n/a");
    expect(multipleLabel(deal({ amountUsd: 0 }))).toBe("n/a");
  });
  it("calls a zero position a write-off", () => {
    expect(multipleLabel(deal({ positionValue: 0 }))).toBe("Written off");
  });
});

describe("summarizeLedger", () => {
  it("sums over the given deals and counts distinct companies and funds", () => {
    const s = summarizeLedger([
      deal(),
      deal({ amountUsd: 50_000, positionValue: null, portfolioCompany: { id: "c2" }, fund: { id: "f2" }, dilutionAware: true }),
    ]);
    expect(s).toEqual({
      totalInvested: 150_000,
      dealCount: 2,
      companyCount: 2,
      fundCount: 2,
      blendedImpliedValue: 250_000,
      anyDilutionAware: true,
    });
  });
  it("handles an empty set", () => {
    expect(summarizeLedger([])).toEqual({
      totalInvested: 0,
      dealCount: 0,
      companyCount: 0,
      fundCount: 0,
      blendedImpliedValue: 0,
      anyDilutionAware: false,
    });
  });
});
