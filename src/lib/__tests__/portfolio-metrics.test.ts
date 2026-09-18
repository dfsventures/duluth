import { describe, it, expect } from "vitest";
import {
  xirr,
  fundFlows,
  computePaidIn,
  tvpi,
  dpi,
  rvpi,
  positionValue,
  computeFundPerformance,
  buildFundReportSnapshot,
  visibleOverrideMetrics,
  hasOverrideValue,
  type StoredFundPerformanceOverride,
} from "@/lib/portfolio-metrics";

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

// Part 14, WS33.2/33.3 — computeFundPerformance()/buildFundReportSnapshot().
// Verified by re-deriving from the same already-tested primitives above
// (reuse, don't re-derive), matching the byte-identical-refactor acceptance
// criterion for src/app/api/admin/funds/[id]/route.ts.
describe("computeFundPerformance", () => {
  const deals = [
    {
      amountUsd: 10000,
      entryValuation: 1_000_000,
      currentValuation: 5_000_000,
      ownershipPct: null,
      dealDate: new Date("2022-01-01"),
      valuationAsOf: new Date("2025-06-01"),
    },
    {
      amountUsd: 20000,
      entryValuation: 2_000_000,
      currentValuation: 4_000_000,
      ownershipPct: 2,
      dealDate: new Date("2023-01-01"),
      valuationAsOf: new Date("2025-12-01"),
    },
  ];
  const cashflows = [
    { kind: "DISTRIBUTION", date: new Date("2024-06-01"), amountUsd: 5000 },
    { kind: "CAPITAL_CALL", date: new Date("2022-01-01"), amountUsd: 10000 },
    { kind: "CAPITAL_CALL", date: new Date("2023-01-01"), amountUsd: 20000 },
  ];

  it("composes positionValue/computePaidIn/tvpi/dpi/xirr exactly like the primitives would by hand", () => {
    const result = computeFundPerformance(deals, cashflows);

    const invested = 30000;
    const pv1 = positionValue({ amountUsd: 10000, entryValuation: 1_000_000, currentValuation: 5_000_000, ownershipPct: null }, 5_000_000);
    const pv2 = positionValue({ amountUsd: 20000, entryValuation: 2_000_000, currentValuation: 4_000_000, ownershipPct: 2 }, 4_000_000);
    const impliedValue = pv1.value! + pv2.value!;
    const { paidIn, approximate } = computePaidIn(invested, [10000, 20000]);
    const asOf = new Date("2025-12-01");
    const expectedGrossIrr = xirr(
      fundFlows(
        deals.map((d) => ({ dealDate: d.dealDate, amountUsd: d.amountUsd })),
        cashflows,
        impliedValue,
        asOf
      )
    );

    expect(result.invested).toBe(invested);
    expect(result.impliedValue).toBeCloseTo(impliedValue, 5);
    expect(result.dilutionAware).toBe(true); // second deal has ownershipPct
    expect(result.paidIn).toBe(paidIn);
    expect(result.approximate).toBe(approximate);
    expect(result.tvpi).toBeCloseTo(tvpi(paidIn, 5000, impliedValue)!, 5);
    expect(result.dpi).toBeCloseTo(dpi(paidIn, 5000)!, 5);
    expect(result.asOf).toEqual(asOf);
    expect(result.grossIrr).toBeCloseTo(expectedGrossIrr!, 5);
  });

  it("falls back to `now` for asOf when no deal has a valuationAsOf", () => {
    const result = computeFundPerformance(
      [{ amountUsd: 1000, entryValuation: null, currentValuation: null, ownershipPct: null, dealDate: new Date("2024-01-01"), valuationAsOf: null }],
      []
    );
    expect(result.asOf.getTime()).toBeGreaterThan(new Date("2026-01-01").getTime());
  });
});

describe("buildFundReportSnapshot", () => {
  const dealInput = {
    companyName: "Acme Co",
    amountUsd: 10000,
    entryValuation: 1_000_000,
    currentValuation: 2_000_000,
    ownershipPct: null,
    dealDate: new Date("2023-05-01"),
    valuationAsOf: new Date("2025-01-01"),
    investmentType: "INITIAL",
    instrument: "SAFE",
  };

  it("carries fundName + performance + per-deal rows with computeMultiple applied", () => {
    const snapshot = buildFundReportSnapshot("Test Fund I", [dealInput], []);
    expect(snapshot.fundName).toBe("Test Fund I");
    expect(snapshot.deals).toHaveLength(1);
    expect(snapshot.deals[0]).toEqual({
      companyName: "Acme Co",
      investmentType: "INITIAL",
      dealDate: dealInput.dealDate.toISOString(),
      amountUsd: 10000,
      instrument: "SAFE",
      entryValuationUsd: 1_000_000,
      currentValuationUsd: 2_000_000,
      multiple: 2,
      valuationAsOf: dealInput.valuationAsOf.toISOString(),
    });
    expect(snapshot.performance.invested).toBe(10000);
  });

  // F103 — a deal's per-row `multiple` must use the same dilution-aware
  // math as the fund-level Implied Value total (positionValue()), not a
  // bare current/entry ratio. Before this fix the two could visibly
  // disagree on the same report: the total would reflect ownershipPct, the
  // deal row underneath it wouldn't.
  it("uses the dilution-aware multiple (positionValue-derived) when ownershipPct is set, not the raw entry/current ratio", () => {
    const dilutedDeal = {
      ...dealInput,
      amountUsd: 25_000,
      entryValuation: 2_500_000,
      currentValuation: 250_000_000, // raw ratio would be 100x
      ownershipPct: 0.5568, // dilution-aware: (0.5568% of 250M) / 25,000 = 55.68x
    };
    const snapshot = buildFundReportSnapshot("Test Fund I", [dilutedDeal], []);
    expect(snapshot.deals[0].multiple).toBeCloseTo(55.68, 5);
  });

  it("Q42 structural guard: never carries a sheetRowId/provenance key, even when the input deal fixture has one", () => {
    const inputWithSheetRowId = { ...dealInput, sheetRowId: "sheet-row-123" };
    const snapshot = buildFundReportSnapshot("Test Fund I", [inputWithSheetRowId], []);
    expect(snapshot.deals[0]).not.toHaveProperty("sheetRowId");
    expect(Object.keys(snapshot.deals[0])).not.toContain("sheetRowId");
    // Belt-and-suspenders: no key anywhere in the row contains "sync"/"sheet".
    for (const key of Object.keys(snapshot.deals[0])) {
      expect(key.toLowerCase()).not.toMatch(/sync|sheet/);
    }
  });

  // Part 15, WS37.2 — the 4th, optional `performanceOverride` parameter.
  // Sibling field on the payload, not mixed into `performance` itself.
  it("defaults performanceOverride to null when the 4th argument is omitted (byte-identical to pre-Part-15 output)", () => {
    const snapshot = buildFundReportSnapshot("Test Fund I", [dealInput], []);
    expect(snapshot.performanceOverride).toBeNull();
  });

  it("attaches a populated override as a sibling field, leaving `performance` untouched", () => {
    const override = {
      grossMoic: 2.5,
      netTvpi: 2.1,
      netDpi: 0.8,
      netIrr: 0.15,
      netNav: 500_000,
      showGrossMoic: true,
      showNetTvpi: true,
      showNetIrr: true,
      showNetNav: true,
    };
    const snapshot = buildFundReportSnapshot("Test Fund I", [dealInput], [], override);
    expect(snapshot.performanceOverride).toEqual(override);
    // The computed performance block is identical to the no-override call —
    // the override never feeds into computeFundPerformance().
    const withoutOverride = buildFundReportSnapshot("Test Fund I", [dealInput], []);
    expect(snapshot.performance).toEqual(withoutOverride.performance);
  });
});

// Part 36, WS98.4 — visibleOverrideMetrics()/hasOverrideValue(). Synthetic
// numbers only (ground rule 1) — never a real MOIC/TVPI/IRR/NAV.
describe("visibleOverrideMetrics", () => {
  it("returns [] for null and undefined", () => {
    expect(visibleOverrideMetrics(null)).toEqual([]);
    expect(visibleOverrideMetrics(undefined)).toEqual([]);
  });

  it("a full five-key object returns all five metrics, in fixed MOIC/TVPI/DPI/IRR/NAV order", () => {
    const override: StoredFundPerformanceOverride = {
      grossMoic: 2.5,
      netTvpi: 2.1,
      netDpi: 0.8,
      netIrr: 0.0205,
      netNav: 500_000,
      showGrossMoic: true,
      showNetTvpi: true,
      showNetIrr: true,
      showNetNav: true,
    };
    const result = visibleOverrideMetrics(override);
    expect(result.map((m) => m.key)).toEqual(["grossMoic", "netTvpi", "netDpi", "netIrr", "netNav"]);
  });

  it("order is fixed regardless of input key order", () => {
    const override: StoredFundPerformanceOverride = {
      netNav: 1,
      netIrr: 0.01,
      netDpi: 1,
      netTvpi: 1,
      grossMoic: 1,
    };
    const result = visibleOverrideMetrics(override);
    expect(result.map((m) => m.key)).toEqual(["grossMoic", "netTvpi", "netDpi", "netIrr", "netNav"]);
  });

  // F94/F93 — the whole point of this workstream.
  it("a legacy (pre-Part-36) three-key snapshot renders exactly 3 metrics and never sprouts netIrr/netNav", () => {
    // Built as a raw object literal with exactly three keys, cast through
    // the stored type — this is what a report published before Part 36
    // actually looks like on disk.
    const legacy = { grossMoic: 2.5, netTvpi: 2.1, netDpi: 0.8 } as StoredFundPerformanceOverride;
    const result = visibleOverrideMetrics(legacy);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.key)).toEqual(["grossMoic", "netTvpi", "netDpi"]);
    expect(result.map((m) => m.key)).not.toContain("netIrr");
    expect(result.map((m) => m.key)).not.toContain("netNav");
  });

  // F93 regression test: this MUST stay false. If someone later "simplifies"
  // the nullish check in hasOverrideValue()/visibleOverrideMetrics() to
  // `!== null`, this test fails — `undefined !== null` is `true`, and that
  // bug would flip every already-published legacy report into override mode.
  it("F93 guard: a legacy object with all three values null has hasOverrideValue() === false", () => {
    const legacy = { grossMoic: null, netTvpi: null, netDpi: null } as StoredFundPerformanceOverride;
    expect(hasOverrideValue(legacy)).toBe(false);
  });

  it("showNetIrr: false with a non-null netIrr hides the Net IRR metric", () => {
    const override: StoredFundPerformanceOverride = { netIrr: 0.05, showNetIrr: false };
    const result = visibleOverrideMetrics(override);
    expect(result.map((m) => m.key)).not.toContain("netIrr");
  });

  it("showNetIrr: true with netIrr: null still shows the metric, with value null (renders —)", () => {
    const override: StoredFundPerformanceOverride = { netIrr: null, showNetIrr: true };
    const result = visibleOverrideMetrics(override);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "netIrr", value: null });
  });

  it("Net DPI is returned regardless of any flag (D2 — untouched by Part 36)", () => {
    const override: StoredFundPerformanceOverride = { netDpi: 0.8 };
    const result = visibleOverrideMetrics(override);
    expect(result.map((m) => m.key)).toContain("netDpi");
  });

  it("a present-but-hidden metric does not by itself count as an override value", () => {
    const override: StoredFundPerformanceOverride = { netIrr: 0.05, showNetIrr: false };
    expect(hasOverrideValue(override)).toBe(false);
  });

  it("format discriminators: netNav is currency, netIrr is percent, the rest are multiple (F96)", () => {
    const override: StoredFundPerformanceOverride = {
      grossMoic: 1,
      netTvpi: 1,
      netDpi: 1,
      netIrr: 0.01,
      netNav: 1,
    };
    const byKey = Object.fromEntries(visibleOverrideMetrics(override).map((m) => [m.key, m.format]));
    expect(byKey.grossMoic).toBe("multiple");
    expect(byKey.netTvpi).toBe("multiple");
    expect(byKey.netDpi).toBe("multiple");
    expect(byKey.netIrr).toBe("percent");
    expect(byKey.netNav).toBe("currency");
  });
});
