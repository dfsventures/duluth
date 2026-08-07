import { describe, it, expect } from "vitest";
import { computeCapTable, effectiveCapsForGroup, type ScenarioInput } from "@/lib/cap-table";

// Part 29, WS67 — pure dilution-engine tests. Synthetic data only
// (Acme / Jane Founder / John Founder etc., per JC-CT-E) — no real
// founder cap table, investor name, or valuation appears here.

function baseInput(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    founders: [{ name: "Jane Founder" }],
    esopPct: 0,
    friendsAndFamily: [],
    preSeed: [],
    ...overrides,
  };
}

function stage(result: ReturnType<typeof computeCapTable>, id: string) {
  const s = result.stages.find((s) => s.id === id);
  if (!s) throw new Error(`stage ${id} not found`);
  return s;
}

function pctOf(s: ReturnType<typeof stage>, stakeholderId: string) {
  const row = s.stakeholders.find((r) => r.id === stakeholderId);
  if (!row) throw new Error(`stakeholder ${stakeholderId} not found in stage ${s.id}`);
  return row.pct;
}

describe("computeCapTable — founder equal split", () => {
  it("splits 100% evenly across 2 founders", () => {
    const result = computeCapTable(
      baseInput({ founders: [{ name: "Jane Founder" }, { name: "John Founder" }] })
    );
    const start = stage(result, "start");
    expect(start.stakeholders).toHaveLength(2);
    expect(pctOf(start, "founder-0")).toBeCloseTo(50, 6);
    expect(pctOf(start, "founder-1")).toBeCloseTo(50, 6);
    expect(start.total).toBeCloseTo(100, 6);
  });

  it("splits 100% evenly across 3 founders", () => {
    const result = computeCapTable(
      baseInput({
        founders: [{ name: "Jane Founder" }, { name: "John Founder" }, { name: "Jo Founder" }],
      })
    );
    const start = stage(result, "start");
    expect(pctOf(start, "founder-0")).toBeCloseTo(100 / 3, 6);
    expect(pctOf(start, "founder-1")).toBeCloseTo(100 / 3, 6);
    expect(pctOf(start, "founder-2")).toBeCloseTo(100 / 3, 6);
    expect(start.total).toBeCloseTo(100, 6);
  });

  it("emits NO_FOUNDERS and returns an empty start stage when there are no founders", () => {
    const result = computeCapTable(baseInput({ founders: [] }));
    expect(result.issues).toContainEqual(
      expect.objectContaining({ level: "error", code: "NO_FOUNDERS" })
    );
    expect(stage(result, "start").stakeholders).toHaveLength(0);
  });
});

describe("computeCapTable — ESOP", () => {
  it("reduces founders by exactly esopPct, nothing else present", () => {
    const result = computeCapTable(
      baseInput({
        founders: [{ name: "Jane Founder" }, { name: "John Founder" }],
        esopPct: 20,
      })
    );
    const preRound = stage(result, "preRound");
    expect(pctOf(preRound, "esop")).toBeCloseTo(20, 6);
    expect(pctOf(preRound, "founder-0")).toBeCloseTo(40, 6);
    expect(pctOf(preRound, "founder-1")).toBeCloseTo(40, 6);
    expect(preRound.total).toBeCloseTo(100, 6);
  });
});

describe("computeCapTable — single SAFE", () => {
  it("ownership = amount / cap", () => {
    const result = computeCapTable(
      baseInput({
        friendsAndFamily: [{ name: "Aunt Sue", amount: 50_000, cap: 1_000_000, mfn: false }],
      })
    );
    const preRound = stage(result, "preRound");
    expect(pctOf(preRound, "ff-0")).toBeCloseTo(5, 6); // 50k / 1M = 5%
    expect(pctOf(preRound, "founder-0")).toBeCloseTo(95, 6);
    expect(preRound.total).toBeCloseTo(100, 6);
  });
});

describe("computeCapTable — MFN cap resolution", () => {
  it("an MFN investor's effective cap = lowest non-MFN cap in the same group", () => {
    const result = computeCapTable(
      baseInput({
        friendsAndFamily: [
          { name: "Investor A", amount: 10_000, cap: 2_000_000, mfn: false },
          { name: "Investor B", amount: 10_000, cap: 1_000_000, mfn: false },
          { name: "Investor C (MFN)", amount: 10_000, cap: 5_000_000, mfn: true },
        ],
      })
    );
    const preRound = stage(result, "preRound");
    // Investor C's effective cap should be 1,000,000 (lowest non-MFN cap),
    // not its own stated 5,000,000 -> 10,000 / 1,000,000 = 1%.
    expect(pctOf(preRound, "ff-2")).toBeCloseTo(1, 6);
  });

  it("MFN scope is per-group — an F&F MFN investor ignores a lower pre-seed cap", () => {
    const result = computeCapTable(
      baseInput({
        friendsAndFamily: [
          { name: "Investor D", amount: 10_000, cap: 9_000_000, mfn: false },
          { name: "Investor E (MFN)", amount: 10_000, cap: 99_000_000, mfn: true },
        ],
        preSeed: [{ name: "Investor F", amount: 10_000, cap: 500_000, mfn: false }],
      })
    );
    const preRound = stage(result, "preRound");
    // If group isolation were broken, Investor E would resolve to the
    // pre-seed 500,000 cap (10,000/500,000 = 2%). It must stay scoped to
    // the F&F group's own lowest non-MFN cap, 9,000,000 (10,000/9,000,000).
    expect(pctOf(preRound, "ff-1")).toBeCloseTo((10_000 / 9_000_000) * 100, 6);
  });

  it("an MFN investor with no non-MFN peer in its group falls back to its own cap", () => {
    const result = computeCapTable(
      baseInput({
        friendsAndFamily: [{ name: "Investor G (MFN, alone)", amount: 10_000, cap: 3_000_000, mfn: true }],
      })
    );
    const preRound = stage(result, "preRound");
    expect(pctOf(preRound, "ff-0")).toBeCloseTo((10_000 / 3_000_000) * 100, 6);
  });
});

describe("computeCapTable — accelerator tranches", () => {
  it("tranche 1 only takes a fixed % at preRound", () => {
    const result = computeCapTable(
      baseInput({
        esopPct: 10,
        accelerator: { tranche1Pct: 7 },
      })
    );
    const preRound = stage(result, "preRound");
    expect(pctOf(preRound, "accelerator")).toBeCloseTo(7, 6);
    expect(pctOf(preRound, "founder-0")).toBeCloseTo(100 - 10 - 7, 6);
  });

  it("tranche 2 converts at seed post-money and is ADDED to the diluted tranche-1 line, not re-sliced", () => {
    const result = computeCapTable(
      baseInput({
        founders: [{ name: "Jane Founder" }, { name: "John Founder" }],
        esopPct: 10,
        accelerator: { tranche1Pct: 7, tranche2Amount: 150_000 },
        seed: { raiseAmount: 1_000_000, postMoneyValuation: 5_000_000 },
      })
    );
    const preRound = stage(result, "preRound");
    const afterSeed = stage(result, "afterSeed");

    const acceleratorPreRound = pctOf(preRound, "accelerator"); // 7
    const seedInvestorPct = (1_000_000 / 5_000_000) * 100; // 20
    const acceleratorT2Pct = (150_000 / 5_000_000) * 100; // 3
    const dilution = 1 - (seedInvestorPct + acceleratorT2Pct) / 100; // 0.77

    expect(pctOf(afterSeed, "accelerator")).toBeCloseTo(acceleratorPreRound * dilution + acceleratorT2Pct, 6);
    expect(pctOf(afterSeed, "seed")).toBeCloseTo(seedInvestorPct, 6);
    expect(afterSeed.total).toBeCloseTo(100, 6);
  });
});

describe("computeCapTable — seed dilution", () => {
  it("dilutes every prior stakeholder by the seed issuance factor; seed line = raise/post", () => {
    const result = computeCapTable(
      baseInput({
        seed: { raiseAmount: 2_000_000, postMoneyValuation: 8_000_000 },
      })
    );
    const preRound = stage(result, "preRound");
    const afterSeed = stage(result, "afterSeed");
    const priorFounderPct = pctOf(preRound, "founder-0");
    const seedPct = (2_000_000 / 8_000_000) * 100; // 25

    expect(pctOf(afterSeed, "seed")).toBeCloseTo(seedPct, 6);
    expect(pctOf(afterSeed, "founder-0")).toBeCloseTo(priorFounderPct * (1 - seedPct / 100), 6);
    expect(afterSeed.total).toBeCloseTo(100, 6);
    expect(afterSeed.enabled).toBe(true);
  });
});

describe("computeCapTable — Series A dilution", () => {
  it("dilutes everyone remaining by exactly pctSold", () => {
    const result = computeCapTable(
      baseInput({
        seed: { raiseAmount: 2_000_000, postMoneyValuation: 8_000_000 },
        seriesA: { pctSold: 15, postMoneyValuation: 40_000_000 },
      })
    );
    const afterSeed = stage(result, "afterSeed");
    const afterSeriesA = stage(result, "afterSeriesA");
    const priorFounderPct = pctOf(afterSeed, "founder-0");
    const priorSeedPct = pctOf(afterSeed, "seed");

    expect(pctOf(afterSeriesA, "seriesA")).toBeCloseTo(15, 6);
    expect(pctOf(afterSeriesA, "founder-0")).toBeCloseTo(priorFounderPct * 0.85, 6);
    expect(pctOf(afterSeriesA, "seed")).toBeCloseTo(priorSeedPct * 0.85, 6);
    expect(afterSeriesA.total).toBeCloseTo(100, 6);
    expect(afterSeriesA.enabled).toBe(true);
  });
});

describe("computeCapTable — every enabled stage sums to ~100", () => {
  it("holds across a fully populated scenario (accelerator + F&F + pre-seed + ESOP + seed + Series A)", () => {
    const result = computeCapTable({
      companyNameOverride: "Acme",
      founders: [{ name: "Jane Founder" }, { name: "John Founder" }],
      esopPct: 10,
      accelerator: { tranche1Pct: 6, tranche2Amount: 125_000 },
      friendsAndFamily: [{ name: "Aunt Sue", amount: 25_000, cap: 4_000_000, mfn: false }],
      preSeed: [
        { name: "Angel One", amount: 250_000, cap: 6_000_000, mfn: false },
        { name: "Angel Two (MFN)", amount: 100_000, cap: 9_000_000, mfn: true },
      ],
      seed: { raiseAmount: 3_000_000, postMoneyValuation: 15_000_000 },
      seriesA: { pctSold: 20, postMoneyValuation: 60_000_000 },
    });

    for (const s of result.stages) {
      expect(s.total, `stage ${s.id} total`).toBeCloseTo(100, 6);
    }
    expect(result.issues.filter((i) => i.level === "error")).toHaveLength(0);
  });
});

describe("computeCapTable — validation issues", () => {
  it("FF_EXCEEDS_100 fires when F&F alone exceeds 100%", () => {
    const result = computeCapTable(
      baseInput({
        friendsAndFamily: [{ name: "Over-invested Uncle", amount: 2_000_000, cap: 1_000_000, mfn: false }],
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ level: "error", code: "FF_EXCEEDS_100" })
    );
  });

  it("PRE_ROUND_OVER_ALLOCATED fires when ESOP + accelerator T1 + all SAFEs exceed 100% before any priced round", () => {
    const result = computeCapTable(
      baseInput({
        esopPct: 50,
        accelerator: { tranche1Pct: 40 },
        friendsAndFamily: [{ name: "Aunt Sue", amount: 200_000, cap: 1_000_000, mfn: false }], // 20%
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ level: "error", code: "PRE_ROUND_OVER_ALLOCATED" })
    );
    // and the founder's stake is clamped to 0, not negative
    const preRound = stage(result, "preRound");
    expect(pctOf(preRound, "founder-0")).toBe(0);
    expect(result.issues).toContainEqual(expect.objectContaining({ level: "error", code: "NEGATIVE_STAKE" }));
  });

  it("SEED_ISSUANCE_INVALID fires when the seed round would issue >= 100% of the company", () => {
    const result = computeCapTable(
      baseInput({
        seed: { raiseAmount: 9_000_000, postMoneyValuation: 8_000_000 },
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ level: "error", code: "SEED_ISSUANCE_INVALID" })
    );
  });

  it("a mathematically valid scenario yields zero error-level issues", () => {
    const result = computeCapTable(
      baseInput({
        founders: [{ name: "Jane Founder" }, { name: "John Founder" }],
        esopPct: 10,
        friendsAndFamily: [{ name: "Aunt Sue", amount: 25_000, cap: 4_000_000, mfn: false }],
      })
    );
    expect(result.issues.filter((i) => i.level === "error")).toHaveLength(0);
  });

  it("an invalid SAFE cap is flagged and treated as zero ownership rather than dividing by an invalid number", () => {
    const result = computeCapTable(
      baseInput({
        friendsAndFamily: [{ name: "Bad Cap Investor", amount: 10_000, cap: 0, mfn: false }],
      })
    );
    expect(result.issues).toContainEqual(expect.objectContaining({ level: "error", code: "INVALID_CAP" }));
    const preRound = stage(result, "preRound");
    expect(pctOf(preRound, "ff-0")).toBe(0);
  });

  it("esopPct outside [0,100] is flagged and clamped", () => {
    const result = computeCapTable(baseInput({ esopPct: 150 }));
    expect(result.issues).toContainEqual(expect.objectContaining({ level: "error", code: "INVALID_ESOP_PCT" }));
    const preRound = stage(result, "preRound");
    expect(pctOf(preRound, "esop")).toBe(100);
  });
});

describe("computeCapTable — disabled stages pass through unchanged", () => {
  it("afterSeed and afterSeriesA carry the prior stage forward when seed/seriesA are absent", () => {
    const result = computeCapTable(
      baseInput({
        founders: [{ name: "Jane Founder" }, { name: "John Founder" }],
        esopPct: 10,
      })
    );
    const preRound = stage(result, "preRound");
    const afterSeed = stage(result, "afterSeed");
    const afterSeriesA = stage(result, "afterSeriesA");

    expect(afterSeed.enabled).toBe(false);
    expect(afterSeed.stakeholders).toEqual(preRound.stakeholders);
    expect(afterSeriesA.enabled).toBe(false);
    expect(afterSeriesA.stakeholders).toEqual(preRound.stakeholders);
  });

  it("afterSeriesA carries afterSeed forward unchanged when only seriesA is absent", () => {
    const result = computeCapTable(
      baseInput({
        seed: { raiseAmount: 1_000_000, postMoneyValuation: 5_000_000 },
      })
    );
    const afterSeed = stage(result, "afterSeed");
    const afterSeriesA = stage(result, "afterSeriesA");

    expect(afterSeed.enabled).toBe(true);
    expect(afterSeriesA.enabled).toBe(false);
    expect(afterSeriesA.stakeholders).toEqual(afterSeed.stakeholders);
  });
});

describe("effectiveCapsForGroup — used by the WS68 editor's live MFN read-out", () => {
  it("matches the MFN resolution used inside computeCapTable", () => {
    const list = [
      { name: "Investor A", amount: 10_000, cap: 2_000_000, mfn: false },
      { name: "Investor B", amount: 10_000, cap: 1_000_000, mfn: false },
      { name: "Investor C (MFN)", amount: 10_000, cap: 5_000_000, mfn: true },
    ];
    const caps = effectiveCapsForGroup(list);
    expect(caps).toEqual([2_000_000, 1_000_000, 1_000_000]);
  });

  it("returns an empty array for an empty/undefined group", () => {
    expect(effectiveCapsForGroup([])).toEqual([]);
    expect(effectiveCapsForGroup(undefined)).toEqual([]);
  });
});

describe("computeCapTable — company name", () => {
  it("uses companyNameOverride when provided", () => {
    const result = computeCapTable(baseInput({ companyNameOverride: "Acme" }));
    expect(result.companyName).toBe("Acme");
  });

  it("falls back to a default when not provided", () => {
    const result = computeCapTable(baseInput());
    expect(result.companyName).toBeTruthy();
  });
});
