// Part 29, WS67 — founder equity-dilution scenario planner engine.
//
// Pure, framework-independent, DB-free module — same posture as
// portfolio-metrics.ts / share-metrics.ts / diligence.ts. Turns a founder's
// self-declared ScenarioInput into a stage-by-stage ownership breakdown
// plus validation issues. Never throws on bad input (matches the `xirr`
// convention of returning a safe value rather than NaN/throwing) — instead
// it clamps to a best-effort result and reports what's wrong via `issues`,
// so the UI can render the partial table *and* the warnings together.
//
// Original implementation of standard, well-documented SAFE-note /
// venture-dilution mechanics. No external reference tool's code was
// consulted or copied — only Felix's plain-language math spec in
// docs/IMPLEMENTATION_PLAN.md Part 29.

export interface Founder {
  name: string;
} // equal split of starting equity

export interface SafeInvestor {
  name: string;
  amount: number; // dollars invested
  cap: number; // stated valuation cap (dollars)
  mfn: boolean; // most-favored-nation
}

export interface AcceleratorConfig {
  tranche1Pct: number; // fixed % taken as first tranche
  tranche2Amount?: number; // optional; converts as NEW money at seed post-money
}

// Marker interface from the Part 29 plan sketch; seed/seriesA below are the concrete shapes.
export interface PricedRound {}

export interface ScenarioInput {
  companyNameOverride?: string;
  founders: Founder[];
  esopPct: number; // taken before external money
  accelerator?: AcceleratorConfig; // stage (a), optional
  friendsAndFamily: SafeInvestor[]; // SAFE group #1 (own MFN scope)
  preSeed: SafeInvestor[]; // SAFE group #2 (own MFN scope)
  seed?: { raiseAmount: number; postMoneyValuation: number }; // stage (b), optional
  seriesA?: { pctSold: number; postMoneyValuation: number }; // stage (c), optional
}

export type StageId = "start" | "preRound" | "afterSeed" | "afterSeriesA";
export type StakeholderGroup =
  | "founder"
  | "esop"
  | "accelerator"
  | "ff"
  | "preseed"
  | "seed"
  | "seriesA";

export interface StakeholderStake {
  id: string; // stable key for React
  label: string; // e.g. "Jane Founder", "ESOP", "Accelerator"
  group: StakeholderGroup;
  pct: number; // 0-100 ownership at this stage
}

export interface ScenarioStage {
  id: StageId;
  label: string; // "Starting", "After F&F + Pre-seed + ESOP + Accelerator", ...
  enabled: boolean; // false stages pass the prior stage through unchanged
  stakeholders: StakeholderStake[];
  total: number; // sum of pct - should be ~100 (guarded)
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string; // e.g. "FF_EXCEEDS_100", "PRE_ROUND_OVER_ALLOCATED"
  message: string;
}

export interface ScenarioResult {
  companyName: string;
  stages: ScenarioStage[];
  issues: ValidationIssue[];
}

const EPSILON = 0.01; // percentage points — numeric-safety net for the stage-total warning
const DEFAULT_COMPANY_NAME = "Company";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Resolve each SAFE group's effective caps + ownership fractions.
 *
 * MFN is scoped to the group passed in (friendsAndFamily and preSeed are
 * resolved independently, so an MFN F&F investor never sees pre-seed
 * caps). An MFN investor's effective cap = the lowest `cap` among the
 * *non-MFN* investors in this same group; a non-MFN investor's effective
 * cap is their own stated cap. If the group has no non-MFN investor at
 * all, an MFN investor falls back to their own stated cap — the only
 * sane definition when there's no reference floor in the group.
 */
function resolveSafeGroup(
  list: SafeInvestor[] | undefined,
  groupLabel: string,
  issues: ValidationIssue[]
): { investor: SafeInvestor; effectiveCap: number; fraction: number }[] {
  const safe = Array.isArray(list) ? list : [];

  safe.forEach((inv) => {
    const label = inv?.name?.trim() || `a ${groupLabel} investor`;
    if (!isFiniteNumber(inv?.cap) || inv.cap <= 0) {
      issues.push({
        level: "error",
        code: "INVALID_CAP",
        message: `${label} has an invalid cap — it must be a number greater than 0.`,
      });
    }
    if (!isFiniteNumber(inv?.amount) || inv.amount < 0) {
      issues.push({
        level: "error",
        code: "INVALID_AMOUNT",
        message: `${label} has an invalid invested amount — it must be a number 0 or greater.`,
      });
    }
  });

  const validNonMfnCaps = safe
    .filter((inv) => !inv.mfn && isFiniteNumber(inv.cap) && inv.cap > 0)
    .map((inv) => inv.cap);
  const lowestNonMfnCap = validNonMfnCaps.length > 0 ? Math.min(...validNonMfnCaps) : null;

  return safe.map((inv) => {
    const ownCapValid = isFiniteNumber(inv.cap) && inv.cap > 0;
    const amount = isFiniteNumber(inv.amount) && inv.amount >= 0 ? inv.amount : 0;

    let effectiveCap: number;
    if (inv.mfn) {
      // MFN: lowest non-MFN cap in this group, falling back to own cap
      // when there's no non-MFN peer to reference (JC in Part 29 spec).
      effectiveCap = lowestNonMfnCap ?? (ownCapValid ? inv.cap : 0);
    } else {
      effectiveCap = ownCapValid ? inv.cap : 0;
    }

    const fraction = effectiveCap > 0 ? amount / effectiveCap : 0;
    return { investor: inv, effectiveCap, fraction };
  });
}

function finalizeStage(
  id: StageId,
  label: string,
  enabled: boolean,
  stakeholders: StakeholderStake[],
  issues: ValidationIssue[]
): ScenarioStage {
  let hadNegative = false;
  const clamped = stakeholders.map((s) => {
    if (s.pct < 0) {
      hadNegative = true;
      return { ...s, pct: 0 };
    }
    return s;
  });

  if (hadNegative) {
    issues.push({
      level: "error",
      code: "NEGATIVE_STAKE",
      message: `A stakeholder's ownership went negative at stage "${label}"; clamped to 0%.`,
    });
  }

  const total = clamped.reduce((sum, s) => sum + s.pct, 0);
  if (clamped.length > 0 && Math.abs(total - 100) > EPSILON) {
    issues.push({
      level: "warning",
      code: "STAGE_TOTAL_MISMATCH",
      message: `Stage "${label}" totals ${total.toFixed(2)}%, not 100%.`,
    });
  }

  return { id, label, enabled, stakeholders: clamped, total };
}

export function computeCapTable(input: ScenarioInput): ScenarioResult {
  const issues: ValidationIssue[] = [];
  const companyName = input?.companyNameOverride?.trim() || DEFAULT_COMPANY_NAME;

  // ---- Founders ----
  const founders = Array.isArray(input?.founders) ? input.founders : [];
  if (founders.length === 0) {
    issues.push({ level: "error", code: "NO_FOUNDERS", message: "Add at least one founder." });
  }
  const founderIds = founders.map((_, i) => `founder-${i}`);
  const founderLabel = (f: Founder, i: number) => f?.name?.trim() || `Founder ${i + 1}`;

  // ---- ESOP ----
  const esopPctRaw = isFiniteNumber(input?.esopPct) ? input.esopPct : 0;
  if (!isFiniteNumber(input?.esopPct) || esopPctRaw < 0 || esopPctRaw > 100) {
    issues.push({
      level: "error",
      code: "INVALID_ESOP_PCT",
      message: "ESOP % must be a number between 0 and 100.",
    });
  }
  const esopPct = clamp(esopPctRaw, 0, 100);

  // ---- Accelerator (optional) ----
  const accelerator = input?.accelerator;
  let acceleratorT1Pct = 0;
  if (accelerator) {
    const t1Raw = isFiniteNumber(accelerator.tranche1Pct) ? accelerator.tranche1Pct : 0;
    if (!isFiniteNumber(accelerator.tranche1Pct) || t1Raw < 0 || t1Raw > 100) {
      issues.push({
        level: "error",
        code: "INVALID_ACCELERATOR_TRANCHE1",
        message: "Accelerator tranche 1 % must be a number between 0 and 100.",
      });
    }
    acceleratorT1Pct = clamp(t1Raw, 0, 100);

    if (accelerator.tranche2Amount !== undefined) {
      if (!isFiniteNumber(accelerator.tranche2Amount) || accelerator.tranche2Amount < 0) {
        issues.push({
          level: "error",
          code: "INVALID_AMOUNT",
          message: "Accelerator tranche 2 amount must be a number 0 or greater.",
        });
      }
      if (!input?.seed) {
        issues.push({
          level: "warning",
          code: "ACCELERATOR_T2_WITHOUT_SEED",
          message: "Accelerator tranche 2 has no seed round to convert into yet — it won't appear until a seed round is added.",
        });
      }
    }
  }

  // ---- SAFE groups (own MFN scope each) ----
  const ffResolved = resolveSafeGroup(input?.friendsAndFamily, "F&F", issues);
  const preSeedResolved = resolveSafeGroup(input?.preSeed, "pre-seed", issues);

  const ffFractionSum = ffResolved.reduce((sum, r) => sum + r.fraction, 0);
  if (ffFractionSum > 1) {
    issues.push({
      level: "error",
      code: "FF_EXCEEDS_100",
      message: "Friends & Family investors alone exceed 100% ownership.",
    });
  }

  const allSafeFractionSum = ffFractionSum + preSeedResolved.reduce((sum, r) => sum + r.fraction, 0);
  const allSafePctSum = allSafeFractionSum * 100;

  if (esopPct + acceleratorT1Pct + allSafePctSum > 100) {
    issues.push({
      level: "error",
      code: "PRE_ROUND_OVER_ALLOCATED",
      message: "ESOP, the Accelerator's first tranche, and SAFE investors together exceed 100% before any priced round.",
    });
  }

  // ---- Stage: start — founders only, equal split ----
  const founderStartPct = founders.length > 0 ? 100 / founders.length : 0;
  const startStage = finalizeStage(
    "start",
    "Starting",
    true,
    founders.map((f, i) => ({ id: founderIds[i], label: founderLabel(f, i), group: "founder" as const, pct: founderStartPct })),
    issues
  );

  // ---- Stage: preRound — after F&F + pre-seed + ESOP + accelerator tranche 1 ----
  const founderPreRoundPct =
    founders.length > 0 ? (100 - (esopPct + acceleratorT1Pct + allSafePctSum)) / founders.length : 0;

  const preRoundRaw: StakeholderStake[] = [
    ...founders.map((f, i) => ({ id: founderIds[i], label: founderLabel(f, i), group: "founder" as const, pct: founderPreRoundPct })),
    { id: "esop", label: "ESOP", group: "esop" as const, pct: esopPct },
    ...ffResolved.map((r, i) => ({
      id: `ff-${i}`,
      label: r.investor?.name?.trim() || `F&F Investor ${i + 1}`,
      group: "ff" as const,
      pct: r.fraction * 100,
    })),
    ...preSeedResolved.map((r, i) => ({
      id: `preseed-${i}`,
      label: r.investor?.name?.trim() || `Pre-seed Investor ${i + 1}`,
      group: "preseed" as const,
      pct: r.fraction * 100,
    })),
  ];
  if (accelerator) {
    preRoundRaw.push({ id: "accelerator", label: "Accelerator", group: "accelerator", pct: acceleratorT1Pct });
  }

  const preRoundStage = finalizeStage(
    "preRound",
    "After F&F + Pre-seed + ESOP + Accelerator",
    true,
    preRoundRaw,
    issues
  );

  // ---- Stage: afterSeed — seed raise (+ accelerator tranche 2 converting) ----
  let afterSeedEnabled = false;
  let afterSeedRaw: StakeholderStake[];
  if (input?.seed) {
    afterSeedEnabled = true;
    const seed = input.seed;
    const postMoneyValid = isFiniteNumber(seed.postMoneyValuation) && seed.postMoneyValuation > 0;
    if (!postMoneyValid) {
      issues.push({
        level: "error",
        code: "INVALID_POST_MONEY",
        message: "Seed post-money valuation must be a number greater than 0.",
      });
    }
    const raiseAmountValid = isFiniteNumber(seed.raiseAmount) && seed.raiseAmount >= 0;
    if (!raiseAmountValid) {
      issues.push({
        level: "error",
        code: "INVALID_AMOUNT",
        message: "Seed raise amount must be a number 0 or greater.",
      });
    }

    const postMoney = postMoneyValid ? seed.postMoneyValuation : 0;
    const raiseAmount = raiseAmountValid ? seed.raiseAmount : 0;
    const seedInvestorPct = postMoney > 0 ? (raiseAmount / postMoney) * 100 : 0;

    const tranche2AmountValid =
      accelerator?.tranche2Amount !== undefined &&
      isFiniteNumber(accelerator.tranche2Amount) &&
      accelerator.tranche2Amount >= 0;
    const tranche2Amount = tranche2AmountValid ? (accelerator!.tranche2Amount as number) : 0;
    const acceleratorT2Pct = postMoney > 0 ? (tranche2Amount / postMoney) * 100 : 0;

    const issuancePct = seedInvestorPct + acceleratorT2Pct;
    if (issuancePct >= 100) {
      issues.push({
        level: "error",
        code: "SEED_ISSUANCE_INVALID",
        message: "The seed round (plus any accelerator tranche 2) would issue 100% or more of the company.",
      });
    }
    const dilutionFactor = 1 - issuancePct / 100;

    afterSeedRaw = preRoundStage.stakeholders.map((s) => {
      const pct = s.pct * dilutionFactor + (s.group === "accelerator" ? acceleratorT2Pct : 0);
      return { ...s, pct };
    });
    afterSeedRaw.push({ id: "seed", label: "Seed Investor", group: "seed", pct: seedInvestorPct });
  } else {
    afterSeedRaw = preRoundStage.stakeholders.map((s) => ({ ...s }));
  }

  const afterSeedStage = finalizeStage("afterSeed", "After Seed", afterSeedEnabled, afterSeedRaw, issues);

  // ---- Stage: afterSeriesA — % sold ----
  let afterSeriesAEnabled = false;
  let afterSeriesARaw: StakeholderStake[];
  if (input?.seriesA) {
    afterSeriesAEnabled = true;
    const seriesA = input.seriesA;
    const pctSoldValid = isFiniteNumber(seriesA.pctSold) && seriesA.pctSold >= 0 && seriesA.pctSold <= 100;
    if (!pctSoldValid) {
      issues.push({
        level: "error",
        code: "INVALID_PCT_SOLD",
        message: "Series A % sold must be a number between 0 and 100.",
      });
    }
    const postMoneyValid = isFiniteNumber(seriesA.postMoneyValuation) && seriesA.postMoneyValuation > 0;
    if (!postMoneyValid) {
      issues.push({
        level: "error",
        code: "INVALID_POST_MONEY",
        message: "Series A post-money valuation must be a number greater than 0.",
      });
    }

    const pctSold = pctSoldValid ? seriesA.pctSold : clamp(isFiniteNumber(seriesA.pctSold) ? seriesA.pctSold : 0, 0, 100);
    const dilutionFactor = 1 - pctSold / 100;

    afterSeriesARaw = afterSeedStage.stakeholders.map((s) => ({ ...s, pct: s.pct * dilutionFactor }));
    afterSeriesARaw.push({ id: "seriesA", label: "Series A Investor", group: "seriesA", pct: pctSold });
  } else {
    afterSeriesARaw = afterSeedStage.stakeholders.map((s) => ({ ...s }));
  }

  const afterSeriesAStage = finalizeStage("afterSeriesA", "After Series A", afterSeriesAEnabled, afterSeriesARaw, issues);

  return {
    companyName,
    stages: [startStage, preRoundStage, afterSeedStage, afterSeriesAStage],
    issues,
  };
}
