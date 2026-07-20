import { describe, it, expect } from "vitest";
import { xirr, fundFlows, computePaidIn, tvpi, dpi, rvpi, positionValue } from "@/lib/portfolio-metrics";

// All numbers below are synthetic/hand-computed (ground rule 1) — never
// derived from the real spreadsheet or production data.

describe("xirr", () => {
  it("two-flow exact case: -1000 now, +1100 in exactly one year -> 10%", () => {
    const t0 = new Date("2024-01-01T00:00:00.000Z");
    const t1 = new Date("2025-01-01T00:00:00.000Z"); // 365 days later, matches the 365-day year convention
    const rate = xirr([
      { date: t0, amount: -1000 },
      { date: t1, amount: 1100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 3);
  });

  it("multi-flow fixture converges to a plausible rate", () => {
    const flows = [
      { date: new Date("2022-01-01"), amount: -10000 },
      { date: new Date("2023-01-01"), amount: -5000 },
      { date: new Date("2024-01-01"), amount: 2000 },
      { date: new Date("2025-01-01"), amount: 20000 },
    ];
    const rate = xirr(flows);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(-0.9999);
    expect(rate!).toBeLessThanOrEqual(10);
    // Sanity: this fixture is a clear net gain, so the rate should be positive.
    expect(rate!).toBeGreaterThan(0);
  });

  it("non-convergent (degenerate same-date flows with no sign crossing) -> null", () => {
    const t0 = new Date("2024-01-01T00:00:00.000Z");
    const rate = xirr([
      { date: t0, amount: -1 },
      { date: t0, amount: 1_000_000 },
    ]);
    expect(rate).toBeNull();
  });

  it("empty flows -> null", () => {
    expect(xirr([])).toBeNull();
  });

  it("one-sided flows (all positive) -> null", () => {
    const rate = xirr([
      { date: new Date("2024-01-01"), amount: 100 },
      { date: new Date("2025-01-01"), amount: 100 },
    ]);
    expect(rate).toBeNull();
  });

  it("one-sided flows (all negative) -> null", () => {
    const rate = xirr([
      { date: new Date("2024-01-01"), amount: -100 },
      { date: new Date("2025-01-01"), amount: -100 },
    ]);
    expect(rate).toBeNull();
  });

  it("single flow -> null (needs at least two)", () => {
    expect(xirr([{ date: new Date("2024-01-01"), amount: -100 }])).toBeNull();
  });

  it("never returns NaN or Infinity even on pathological input", () => {
    const rate = xirr([
      { date: new Date("2024-01-01"), amount: -0.0000001 },
      { date: new Date("2050-01-01"), amount: 999999999 },
    ]);
    if (rate !== null) {
      expect(Number.isFinite(rate)).toBe(true);
      expect(rate).toBeGreaterThan(-0.9999);
      expect(rate).toBeLessThanOrEqual(10);
    }
  });
});

describe("fundFlows", () => {
  it("deals become outflows, DISTRIBUTION becomes inflow, FEE becomes outflow, CAPITAL_CALL is excluded, NAV lands as a terminal inflow", () => {
    const asOf = new Date("2026-01-01");
    const flows = fundFlows(
      [{ dealDate: new Date("2024-01-01"), amountUsd: 1000 }],
      [
        { kind: "DISTRIBUTION", date: new Date("2025-01-01"), amountUsd: 200 },
        { kind: "FEE", date: new Date("2025-06-01"), amountUsd: 50 },
        { kind: "CAPITAL_CALL", date: new Date("2024-01-01"), amountUsd: 1000 },
      ],
      3000,
      asOf
    );
    expect(flows).toEqual([
      { date: new Date("2024-01-01"), amount: -1000 },
      { date: new Date("2025-01-01"), amount: 200 },
      { date: new Date("2025-06-01"), amount: -50 },
      { date: asOf, amount: 3000 },
    ]);
  });

  it("skips a non-positive terminal NAV", () => {
    const flows = fundFlows([], [], 0, new Date("2026-01-01"));
    expect(flows).toEqual([]);
  });
});

describe("computePaidIn", () => {
  it("falls back to deal-amount total and flags approximate when no capital calls recorded", () => {
    const result = computePaidIn(50000, []);
    expect(result).toEqual({ paidIn: 50000, approximate: true });
  });

  it("uses the real capital-call total (not approximate) when calls exist", () => {
    const result = computePaidIn(50000, [10000, 15000]);
    expect(result).toEqual({ paidIn: 25000, approximate: false });
  });
});

describe("tvpi/dpi/rvpi", () => {
  it("compute the standard ratios", () => {
    expect(tvpi(100, 30, 150)).toBeCloseTo(1.8, 5);
    expect(dpi(100, 30)).toBeCloseTo(0.3, 5);
    expect(rvpi(100, 150)).toBeCloseTo(1.5, 5);
  });

  it("return null when paidIn is zero or negative (nothing to divide by)", () => {
    expect(tvpi(0, 10, 10)).toBeNull();
    expect(dpi(0, 10)).toBeNull();
    expect(rvpi(0, 10)).toBeNull();
  });
});

describe("positionValue", () => {
  it("dilution-aware branch: ownershipPct known -> ownershipPct% of the latest mark", () => {
    const result = positionValue(
      { amountUsd: 10000, entryValuation: 1_000_000, currentValuation: 5_000_000, ownershipPct: 2 },
      5_000_000
    );
    expect(result).toEqual({ value: 100_000, dilutionAware: true });
  });

  it("zero-dilution fallback: no ownershipPct -> amountUsd x multiple, badged not dilution-aware", () => {
    const result = positionValue(
      { amountUsd: 10000, entryValuation: 1_000_000, currentValuation: 5_000_000, ownershipPct: null },
      5_000_000
    );
    expect(result).toEqual({ value: 50_000, dilutionAware: false });
  });

  it("unknown multiple (no entry valuation) -> null value, not dilution-aware", () => {
    const result = positionValue({ amountUsd: 10000, entryValuation: null, currentValuation: 5_000_000, ownershipPct: null }, 5_000_000);
    expect(result).toEqual({ value: null, dilutionAware: false });
  });
});
