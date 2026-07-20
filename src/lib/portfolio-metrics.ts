import { computeMultiple } from "@/lib/report-snapshot";

// Pure derived-metrics engine behind Part 10, WS26 — admin-only (Q23).
// Nothing here is imported by /lp, share, or hover-card code (grep-guarded
// in the acceptance checklist). Same extraction pattern as route-access.ts /
// share-metrics.ts / report-snapshot.ts: no DB access, fully unit-testable.
//
// HONESTY NOTE (read before trusting a number this module produces): these
// are admin-only *estimates*. Gross IRR assumes deal amounts are the
// invested-capital outflow (the one number we reliably have for all 76
// deals) and a terminal NAV inflow from the latest valuation mark — it is
// gross of fees unless FEE cashflow rows exist. TVPI/DPI need real
// capital-call and distribution bookkeeping to be precise; when a fund has
// none recorded, paidIn falls back to Σ deal amounts and the result is
// flagged `approximate: true`. Never presented as more precise than that.

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
const MIN_RATE = -0.9999; // guard rail: rates can't go below -100%
const MAX_RATE = 10; // guard rail: cap at 1000% to keep the search bounded

export interface CashFlow {
  date: Date;
  amount: number; // negative = outflow, positive = inflow
}

function xnpv(rate: number, flows: CashFlow[], t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / MS_PER_YEAR;
    sum += f.amount / Math.pow(1 + rate, years);
  }
  return sum;
}

function xnpvDerivative(rate: number, flows: CashFlow[], t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / MS_PER_YEAR;
    if (years === 0) continue;
    sum -= (years * f.amount) / Math.pow(1 + rate, years + 1);
  }
  return sum;
}

/**
 * XIRR via Newton's method with a bisection fallback. Requires at least one
 * negative and one positive flow; clamps the search to (MIN_RATE, MAX_RATE];
 * returns `null` on non-convergence — never NaN/Infinity.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;

  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();

  // Newton's method from a reasonable starting guess.
  let rate = 0.1;
  let newtonResult: number | null = null;
  for (let i = 0; i < 100; i++) {
    const f = xnpv(rate, sorted, t0);
    const fp = xnpvDerivative(rate, sorted, t0);
    if (!Number.isFinite(f) || !Number.isFinite(fp) || Math.abs(fp) < 1e-12) break;
    let next = rate - f / fp;
    if (!Number.isFinite(next)) break;
    if (next <= MIN_RATE) next = MIN_RATE + 1e-6;
    if (next > MAX_RATE) next = MAX_RATE;
    if (Math.abs(next - rate) < 1e-9) {
      rate = next;
      newtonResult = rate;
      break;
    }
    rate = next;
  }

  if (newtonResult !== null) {
    const residual = xnpv(newtonResult, sorted, t0);
    const scale = sorted.reduce((s, f) => s + Math.abs(f.amount), 0) || 1;
    if (Number.isFinite(residual) && Math.abs(residual) / scale < 1e-6 && newtonResult > MIN_RATE && newtonResult <= MAX_RATE) {
      return newtonResult;
    }
  }

  // Bisection fallback over the guard-railed range.
  let lo = MIN_RATE;
  let hi = MAX_RATE;
  let fLo = xnpv(lo, sorted, t0);
  let fHi = xnpv(hi, sorted, t0);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) {
    return null; // no sign change across the guard-railed range — non-convergent
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = xnpv(mid, sorted, t0);
    if (!Number.isFinite(fMid)) return null;
    const scale = sorted.reduce((s, f) => s + Math.abs(f.amount), 0) || 1;
    if (Math.abs(fMid) / scale < 1e-6 || hi - lo < 1e-9) {
      return mid;
    }
    if ((fLo < 0) === (fMid < 0)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
      fHi = fMid;
    }
  }
  return null;
}

export interface FundFlowDeal {
  dealDate: Date;
  amountUsd: number;
}

export interface FundFlowCashflow {
  kind: "CAPITAL_CALL" | "DISTRIBUTION" | "FEE" | "OTHER" | string;
  date: Date;
  amountUsd: number;
}

/**
 * Assembles the gross cashflow series for a fund's XIRR: every deal amount
 * as a dated outflow (the one reliably-known "capital deployed" number),
 * DISTRIBUTION rows as inflows, FEE rows as an additional outflow (present
 * only when a fund tracks its own fee cashflows — this is what makes the
 * IRR gross-of-fees by default and closer to net when FEE rows exist), and
 * a terminal NAV inflow at `asOf` if positive.
 *
 * CAPITAL_CALL rows are deliberately NOT added to this series: deal amounts
 * already represent the capital-deployed outflow, so folding capital calls
 * in as well would double-count invested capital. CAPITAL_CALL rows instead
 * feed `computePaidIn`'s TVPI override below — a fund that tracks real
 * calls gets a more accurate "paid-in" figure for TVPI/DPI without
 * corrupting the IRR series. (This is a documented implementation choice,
 * not spelled out letter-for-letter in the Part 10 plan text — flagged for
 * a quick sanity check, cheap to revisit: the only change needed is here.)
 */
export function fundFlows(
  deals: FundFlowDeal[],
  cashflows: FundFlowCashflow[],
  impliedNav: number,
  asOf: Date
): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const d of deals) {
    flows.push({ date: d.dealDate, amount: -Math.abs(d.amountUsd) });
  }
  for (const c of cashflows) {
    if (c.kind === "DISTRIBUTION") {
      flows.push({ date: c.date, amount: Math.abs(c.amountUsd) });
    } else if (c.kind === "FEE") {
      flows.push({ date: c.date, amount: -Math.abs(c.amountUsd) });
    }
    // CAPITAL_CALL / OTHER: intentionally excluded from the IRR series (see above).
  }
  if (impliedNav > 0) {
    flows.push({ date: asOf, amount: impliedNav });
  }
  return flows;
}

/**
 * paidIn for TVPI/DPI: Σ CAPITAL_CALL cashflow rows when a fund has any
 * (the more accurate figure — called capital can differ from what got
 * deployed, e.g. reserves), else Σ deal amounts with `approximate: true`
 * (the shipped assumption: for most DFS Lab funds, 1 deal ≈ 1 capital call,
 * but that has never actually been recorded, so say so rather than
 * pretending precision that doesn't exist).
 */
export function computePaidIn(dealAmountsTotal: number, capitalCallRows: number[]): { paidIn: number; approximate: boolean } {
  if (capitalCallRows.length > 0) {
    return { paidIn: capitalCallRows.reduce((s, a) => s + Math.abs(a), 0), approximate: false };
  }
  return { paidIn: dealAmountsTotal, approximate: true };
}

/** TVPI = (distributions + NAV) / paidIn. `null` when paidIn <= 0 (nothing to divide by). */
export function tvpi(paidIn: number, distributions: number, nav: number): number | null {
  if (paidIn <= 0) return null;
  return (distributions + nav) / paidIn;
}

/** DPI = distributions / paidIn. `null` when paidIn <= 0. */
export function dpi(paidIn: number, distributions: number): number | null {
  if (paidIn <= 0) return null;
  return distributions / paidIn;
}

/** RVPI = NAV / paidIn. `null` when paidIn <= 0. */
export function rvpi(paidIn: number, nav: number): number | null {
  if (paidIn <= 0) return null;
  return nav / paidIn;
}

export interface PositionValueDeal {
  amountUsd: number;
  entryValuation: number | null;
  currentValuation: number | null;
  ownershipPct: number | null; // 0-100
}

export interface PositionValueResult {
  value: number | null;
  dilutionAware: boolean;
}

/**
 * Dilution-aware when ownershipPct is known (ownershipPct% of the latest
 * company valuation mark). Otherwise falls back to the shipped
 * zero-dilution assumption — amountUsd × multiple — with
 * `dilutionAware: false` so the UI can badge it (expected: everywhere,
 * until the sheet's round-size/ownership columns land, Q24).
 */
export function positionValue(deal: PositionValueDeal, latestMarkValuationUsd: number | null): PositionValueResult {
  if (deal.ownershipPct !== null && latestMarkValuationUsd !== null) {
    return { value: (deal.ownershipPct / 100) * latestMarkValuationUsd, dilutionAware: true };
  }
  const multiple = computeMultiple(deal.entryValuation, deal.currentValuation);
  if (multiple === null) return { value: null, dilutionAware: false };
  return { value: deal.amountUsd * multiple, dilutionAware: false };
}
