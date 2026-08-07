// Part 29, WS66 — server-side *shape* validation for a CapTableScenario's
// `inputs` JSON blob. Deliberately separate from src/lib/cap-table.ts
// (the pure math engine, which tolerates out-of-range numbers and reports
// them as ValidationIssues so a founder can see *why* a saved scenario is
// impossible). This module is the API-layer gate: it rejects malformed
// shapes outright (400), the same way PATCH .../diligence allowlists
// fields rather than trusting the client body wholesale. A scenario that
// passes this check may still be mathematically impossible — that's fine,
// computeCapTable() surfaces it as issues, not a stored-data problem.

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateSafeList(list: unknown, label: string): string | null {
  if (!Array.isArray(list)) return `${label} must be an array.`;
  for (const entry of list) {
    if (!entry || typeof entry !== "object") return `Each ${label} investor must be an object.`;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.name !== "string") return `Each ${label} investor must have a string name.`;
    if (!isFiniteNumber(rec.amount) || rec.amount < 0) {
      return `Each ${label} investor's amount must be a number >= 0.`;
    }
    if (!isFiniteNumber(rec.cap) || rec.cap <= 0) {
      return `Each ${label} investor's cap must be a number > 0.`;
    }
    if (typeof rec.mfn !== "boolean") return `Each ${label} investor's mfn flag must be a boolean.`;
  }
  return null;
}

/**
 * Returns an error message if `input` isn't a well-shaped ScenarioInput,
 * or null if it's safe to store. Does not evaluate business-math validity
 * (e.g. F&F exceeding 100%) — that's computeCapTable()'s job at read time.
 */
export function validateScenarioInputShape(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Scenario inputs must be an object.";
  }
  const i = input as Record<string, unknown>;

  if (!Array.isArray(i.founders)) return "founders must be an array.";
  for (const f of i.founders) {
    if (!f || typeof f !== "object" || typeof (f as Record<string, unknown>).name !== "string") {
      return "Each founder must have a string name.";
    }
  }

  if (!isFiniteNumber(i.esopPct) || i.esopPct < 0 || i.esopPct > 100) {
    return "esopPct must be a number between 0 and 100.";
  }

  const ffError = validateSafeList(i.friendsAndFamily, "friends & family");
  if (ffError) return ffError;
  const preSeedError = validateSafeList(i.preSeed, "pre-seed");
  if (preSeedError) return preSeedError;

  if (i.accelerator !== undefined) {
    if (!i.accelerator || typeof i.accelerator !== "object") return "accelerator must be an object.";
    const acc = i.accelerator as Record<string, unknown>;
    if (!isFiniteNumber(acc.tranche1Pct) || acc.tranche1Pct < 0 || acc.tranche1Pct > 100) {
      return "accelerator.tranche1Pct must be a number between 0 and 100.";
    }
    if (acc.tranche2Amount !== undefined && (!isFiniteNumber(acc.tranche2Amount) || acc.tranche2Amount < 0)) {
      return "accelerator.tranche2Amount must be a number >= 0.";
    }
  }

  if (i.seed !== undefined) {
    if (!i.seed || typeof i.seed !== "object") return "seed must be an object.";
    const seed = i.seed as Record<string, unknown>;
    if (!isFiniteNumber(seed.raiseAmount) || seed.raiseAmount < 0) {
      return "seed.raiseAmount must be a number >= 0.";
    }
    if (!isFiniteNumber(seed.postMoneyValuation) || seed.postMoneyValuation <= 0) {
      return "seed.postMoneyValuation must be a number > 0.";
    }
  }

  if (i.seriesA !== undefined) {
    if (!i.seriesA || typeof i.seriesA !== "object") return "seriesA must be an object.";
    const seriesA = i.seriesA as Record<string, unknown>;
    if (!isFiniteNumber(seriesA.pctSold) || seriesA.pctSold < 0 || seriesA.pctSold > 100) {
      return "seriesA.pctSold must be a number between 0 and 100.";
    }
    if (!isFiniteNumber(seriesA.postMoneyValuation) || seriesA.postMoneyValuation <= 0) {
      return "seriesA.postMoneyValuation must be a number > 0.";
    }
  }

  if (i.companyNameOverride !== undefined && typeof i.companyNameOverride !== "string") {
    return "companyNameOverride must be a string.";
  }

  return null;
}

/** A blank scenario for the "New scenario" create path when no inputs are supplied. */
export function defaultScenarioInputs() {
  return {
    founders: [{ name: "" }],
    esopPct: 0,
    friendsAndFamily: [],
    preSeed: [],
  };
}
