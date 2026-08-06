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

// ─── Part 14, WS33.2 — computeFundPerformance() ────────────────────────────
// Extracted, byte-identical-output refactor of the block that used to live
// inline in src/app/api/admin/funds/[id]/route.ts (GET, lines ~37-80). Same
// admin-only estimate semantics as everywhere else in this module (Q23) —
// moved, not rewritten, so both the admin fund route AND the Part 14
// fund-report snapshot (publish freeze + live draft preview) call the exact
// same logic instead of a third hand-copied version of this ~30-line block.

export interface FundPerformanceDeal {
  amountUsd: number;
  entryValuation: number | null;
  currentValuation: number | null;
  ownershipPct: number | null;
  dealDate: Date;
  valuationAsOf: Date | null;
}

export interface FundPerformanceCashflow {
  kind: string;
  date: Date;
  amountUsd: number;
}

export interface FundPerformance {
  invested: number;
  impliedValue: number;
  dilutionAware: boolean;
  paidIn: number;
  approximate: boolean;
  tvpi: number | null;
  dpi: number | null;
  grossIrr: number | null;
  asOf: Date;
}

export function computeFundPerformance(deals: FundPerformanceDeal[], cashflows: FundPerformanceCashflow[]): FundPerformance {
  const invested = deals.reduce((s, d) => s + Number(d.amountUsd), 0);
  let impliedValue = 0;
  let anyDilutionAware = false;
  for (const d of deals) {
    const pv = positionValue(
      {
        amountUsd: Number(d.amountUsd),
        entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
        currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
        ownershipPct: d.ownershipPct !== null ? Number(d.ownershipPct) : null,
      },
      d.currentValuation !== null ? Number(d.currentValuation) : null
    );
    if (pv.value !== null) impliedValue += pv.value;
    if (pv.dilutionAware) anyDilutionAware = true;
  }
  const distributions = cashflows.filter((c) => c.kind === "DISTRIBUTION").reduce((s, c) => s + Number(c.amountUsd), 0);
  const capitalCallAmounts = cashflows.filter((c) => c.kind === "CAPITAL_CALL").map((c) => Number(c.amountUsd));
  const { paidIn, approximate } = computePaidIn(invested, capitalCallAmounts);
  const latestValuationAsOf = deals.reduce<Date | null>((latest, d) => {
    if (!d.valuationAsOf) return latest;
    return !latest || d.valuationAsOf > latest ? d.valuationAsOf : latest;
  }, null);
  const asOf = latestValuationAsOf ?? new Date();
  const grossIrr = xirr(
    fundFlows(
      deals.map((d) => ({ dealDate: d.dealDate, amountUsd: Number(d.amountUsd) })),
      cashflows.map((c) => ({ kind: c.kind, date: c.date, amountUsd: Number(c.amountUsd) })),
      impliedValue,
      asOf
    )
  );

  return {
    invested,
    impliedValue,
    dilutionAware: anyDilutionAware,
    paidIn,
    approximate,
    tvpi: tvpi(paidIn, distributions, impliedValue),
    dpi: dpi(paidIn, distributions),
    grossIrr,
    asOf,
  };
}

// ─── Part 14, WS33.3 — buildFundReportSnapshot() ───────────────────────────
// The frozen payload for an LP-report fund-performance snapshot block (Q40-A
// stats + Q41-A full deal table). Q42 is held STRUCTURALLY here: the input/
// output types below have no sheetRowId/provenance field at all, so there is
// no "synced from sheet" data for any caller to accidentally forward into an
// LP-facing payload.

export interface FundSnapshotDealInput {
  amountUsd: number;
  entryValuation: number | null;
  currentValuation: number | null;
  ownershipPct: number | null;
  dealDate: Date;
  valuationAsOf: Date | null;
  investmentType: string;
  instrument: string | null;
}

export interface FundSnapshotDealRow {
  companyName: string;
  investmentType: string;
  dealDate: string; // ISO
  amountUsd: number;
  instrument: string | null;
  entryValuationUsd: number | null;
  currentValuationUsd: number | null;
  multiple: number | null; // reuses computeMultiple from report-snapshot.ts
  valuationAsOf: string | null; // JC-D — included even though Q41-A's literal list didn't name it
}

// Part 15, WS37.2 — a fund's manual performance override (Q46/Q47). Deliberately
// NOT part of FundPerformance/computeFundPerformance()'s own shape — that
// function stays a pure, byte-identical computation from deals/cashflows
// (ground rule 1). Callers that have a fund's override columns attach this
// as a sibling field when building the payload.
export interface FundPerformanceOverride {
  grossMoic: number | null;
  netTvpi: number | null;
  netDpi: number | null;
}

export interface FundSnapshotPayload {
  fundName: string; // never fund.slug — finding #3
  performance: FundPerformance;
  performanceOverride: FundPerformanceOverride | null; // Part 15 — null for every fund without an override today
  deals: FundSnapshotDealRow[];
}

export function buildFundReportSnapshot(
  fundName: string,
  deals: (FundSnapshotDealInput & { companyName: string })[],
  cashflows: FundPerformanceCashflow[],
  performanceOverride: FundPerformanceOverride | null = null
): FundSnapshotPayload {
  return {
    fundName,
    performance: computeFundPerformance(deals, cashflows),
    performanceOverride,
    deals: deals.map((d) => ({
      companyName: d.companyName,
      investmentType: d.investmentType,
      dealDate: d.dealDate.toISOString(),
      amountUsd: d.amountUsd,
      instrument: d.instrument,
      entryValuationUsd: d.entryValuation,
      currentValuationUsd: d.currentValuation,
      multiple: computeMultiple(d.entryValuation, d.currentValuation),
      valuationAsOf: d.valuationAsOf ? d.valuationAsOf.toISOString() : null,
      // Deliberately no sheetRowId / "synced from sheet" field of any kind —
      // Q42 is held structurally (the type has no such key), not just hidden
      // by the renderer.
    })),
  };
}
