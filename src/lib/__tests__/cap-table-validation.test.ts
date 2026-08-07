import { describe, it, expect } from "vitest";
import { validateScenarioInputShape, defaultScenarioInputs } from "@/lib/cap-table-validation";

// Part 29, WS66 — shape-only validation for CapTableScenario.inputs.
// Synthetic data only (JC-CT-E).

const VALID = {
  founders: [{ name: "Jane Founder" }],
  esopPct: 10,
  friendsAndFamily: [{ name: "Aunt Sue", amount: 25000, cap: 4000000, mfn: false }],
  preSeed: [],
  accelerator: { tranche1Pct: 7, tranche2Amount: 150000 },
  seed: { raiseAmount: 1000000, postMoneyValuation: 5000000 },
  seriesA: { pctSold: 20, postMoneyValuation: 20000000 },
};

describe("validateScenarioInputShape", () => {
  it("accepts a fully-populated, well-shaped scenario", () => {
    expect(validateScenarioInputShape(VALID)).toBeNull();
  });

  it("accepts the default blank scenario", () => {
    expect(validateScenarioInputShape(defaultScenarioInputs())).toBeNull();
  });

  it("rejects a non-object", () => {
    expect(validateScenarioInputShape("nope")).not.toBeNull();
    expect(validateScenarioInputShape(null)).not.toBeNull();
    expect(validateScenarioInputShape([1, 2])).not.toBeNull();
  });

  it("rejects non-array founders", () => {
    expect(validateScenarioInputShape({ ...VALID, founders: "nope" })).not.toBeNull();
  });

  it("rejects esopPct out of range", () => {
    expect(validateScenarioInputShape({ ...VALID, esopPct: 150 })).not.toBeNull();
    expect(validateScenarioInputShape({ ...VALID, esopPct: -1 })).not.toBeNull();
  });

  it("rejects a SAFE investor missing cap", () => {
    expect(
      validateScenarioInputShape({
        ...VALID,
        friendsAndFamily: [{ name: "Aunt Sue", amount: 1000, mfn: false }],
      })
    ).not.toBeNull();
  });

  it("rejects a SAFE investor with a non-boolean mfn flag", () => {
    expect(
      validateScenarioInputShape({
        ...VALID,
        friendsAndFamily: [{ name: "Aunt Sue", amount: 1000, cap: 10000, mfn: "yes" }],
      })
    ).not.toBeNull();
  });

  it("rejects a malformed accelerator", () => {
    expect(validateScenarioInputShape({ ...VALID, accelerator: { tranche1Pct: 200 } })).not.toBeNull();
    expect(validateScenarioInputShape({ ...VALID, accelerator: { tranche1Pct: 5, tranche2Amount: -1 } })).not.toBeNull();
  });

  it("rejects a malformed seed", () => {
    expect(validateScenarioInputShape({ ...VALID, seed: { raiseAmount: -1, postMoneyValuation: 5000000 } })).not.toBeNull();
    expect(validateScenarioInputShape({ ...VALID, seed: { raiseAmount: 100, postMoneyValuation: 0 } })).not.toBeNull();
  });

  it("rejects a malformed seriesA", () => {
    expect(validateScenarioInputShape({ ...VALID, seriesA: { pctSold: 150, postMoneyValuation: 100 } })).not.toBeNull();
    expect(validateScenarioInputShape({ ...VALID, seriesA: { pctSold: 10, postMoneyValuation: -1 } })).not.toBeNull();
  });

  it("accepts scenarios where accelerator/seed/seriesA are entirely absent", () => {
    const { accelerator, seed, seriesA, ...rest } = VALID;
    void accelerator;
    void seed;
    void seriesA;
    expect(validateScenarioInputShape(rest)).toBeNull();
  });
});
