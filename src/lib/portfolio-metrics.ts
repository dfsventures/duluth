import { computeMultiple, positionValue, type PositionValueDeal, type PositionValueResult } from "@/lib/report-snapshot";

// positionValue()/PositionValueDeal/PositionValueResult moved to
// report-snapshot.ts (F103 follow-up), so buildMentionSnapshot there can use
// it without an import cycle. Re-exported here unchanged so every existing
// `import { positionValue } from "@/lib/portfolio-metrics"` call site (and
// this file's own callers below) keeps working untouched.
export { positionValue };
export type { PositionValueDeal, PositionValueResult };

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
  // F103 — derived via positionValue(), not a bare computeMultiple(entry,
  // current) call: when a deal's ownershipPct is known, this is the
  // dilution-aware effective multiple (positionValue / amountUsd), matching
  // the fund-level Implied Value total. Byte-identical to the old
  // computeMultiple() result for the (still-common) case where ownershipPct
  // is null.
  multiple: number | null;
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
  // Part 36, WS98 (D5). Required, not optional — every construction site
  // must be updated, and the compiler is the only thing that will say so
  // at three of them.
  netIrr: number | null;
  netNav: number | null;
  // Part 36, WS98 (D4). Visibility is data, never a fund-name conditional.
  showGrossMoic: boolean;
  showNetTvpi: boolean;
  showNetIrr: boolean;
  showNetNav: boolean;
}

/**
 * Part 36, WS98 — the shape a FROZEN snapshot may actually have.
 *
 * FundReportFundSnapshot.snapshot is JSON written at publish time and never
 * migrated. Reports published before Part 36 carry an object with exactly
 * three keys — grossMoic/netTvpi/netDpi — and NO netIrr, netNav or show*
 * keys at all. Not null: ABSENT. Every reader of a frozen payload must use
 * this type, never FundPerformanceOverride, so the compiler stops anyone
 * assuming the new keys are there (F93, F94).
 */
export type StoredFundPerformanceOverride = Partial<FundPerformanceOverride>;

export type OverrideMetricFormat = "multiple" | "percent" | "currency";

export interface OverrideMetric {
  key: "grossMoic" | "netTvpi" | "netDpi" | "netIrr" | "netNav";
  label: string;
  value: number | null;
  format: OverrideMetricFormat;
}

// Display order is fixed here, not at the call site: MOIC, TVPI, DPI, IRR,
// NAV. Net DPI keeps its existing third slot untouched (D2).
const OVERRIDE_METRIC_SPECS = [
  { key: "grossMoic", label: "Gross MOIC", format: "multiple", flag: "showGrossMoic" },
  { key: "netTvpi",   label: "Net TVPI",   format: "multiple", flag: "showNetTvpi" },
  // Net DPI has NO visibility flag (D2 — untouched by Part 36). It renders
  // whenever its key is present, exactly as it always has.
  { key: "netDpi",    label: "Net DPI",    format: "multiple", flag: null },
  { key: "netIrr",    label: "Net IRR",    format: "percent",  flag: "showNetIrr" },
  { key: "netNav",    label: "Net NAV",    format: "currency", flag: "showNetNav" },
] as const;

/**
 * Part 36, WS98 — the single source of truth for which override metrics a
 * Performance card renders.
 *
 * TWO RULES, and both exist because a frozen snapshot is never migrated:
 *
 *  1. KEY PRESENCE, not value nullity (F94). A metric appears only if its
 *     key EXISTS on the object. A pre-Part-36 snapshot has no `netIrr` key,
 *     so it renders no Net IRR box — rather than sprouting a "—" box in a
 *     report an LP already received.
 *  2. NULLISH comparison, never `!== null` (F93). `undefined !== null` is
 *     true, and writing it that way would flip every historical report into
 *     override mode.
 *
 * A missing show* flag means "not hidden" — legacy snapshots predate the
 * flags and must render exactly as they did before.
 */
export function visibleOverrideMetrics(
  override: StoredFundPerformanceOverride | null | undefined
): OverrideMetric[] {
  if (!override) return [];
  return OVERRIDE_METRIC_SPECS.filter((spec) => {
    if (!(spec.key in override)) return false;          // rule 1
    if (spec.flag && override[spec.flag] === false) return false; // explicit hide only
    return true;
  }).map((spec) => ({
    key: spec.key,
    label: spec.label,
    format: spec.format,
    value: override[spec.key] ?? null,                   // rule 2
  }));
}

/** True when the card should show override metrics instead of computed TVPI/DPI/Gross IRR. */
export function hasOverrideValue(override: StoredFundPerformanceOverride | null | undefined): boolean {
  return visibleOverrideMetrics(override).some((m) => m.value != null); // rule 2
}

export interface FundSnapshotPayload {
  fundName: string; // never fund.slug — finding #3
  performance: FundPerformance;
  // Part 36, WS98.2 — the STORED (partial) shape, not the full input type.
  // buildFundReportSnapshot() below still accepts a full FundPerformanceOverride
  // as its 4th parameter (so construction sites stay compiler-checked); this
  // is what a reader of a frozen payload actually gets back (F93, F94).
  performanceOverride: StoredFundPerformanceOverride | null; // Part 15 — null for every fund without an override today
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
    deals: deals.map((d) => {
      // F103 — the per-deal table used to call computeMultiple(entry,
      // current) directly, ignoring ownershipPct entirely, while the
      // fund-level Implied Value total (above, via computeFundPerformance)
      // already used positionValue()'s dilution-aware math. That mismatch
      // is exactly what let the two numbers visibly disagree on the same
      // card. Routing through positionValue() here and deriving an
      // effective multiple (value / amountUsd) makes the two consistent;
      // for a deal with no ownershipPct set, positionValue() falls back to
      // amountUsd * computeMultiple(...), so multiple = value / amountUsd
      // reduces to the exact same computeMultiple() result as before.
      const pv = positionValue(
        { amountUsd: d.amountUsd, entryValuation: d.entryValuation, currentValuation: d.currentValuation, ownershipPct: d.ownershipPct },
        d.currentValuation
      );
      const multiple = pv.value !== null && d.amountUsd > 0 ? pv.value / d.amountUsd : null;
      return {
        companyName: d.companyName,
        investmentType: d.investmentType,
        dealDate: d.dealDate.toISOString(),
        amountUsd: d.amountUsd,
        instrument: d.instrument,
        entryValuationUsd: d.entryValuation,
        currentValuationUsd: d.currentValuation,
        multiple,
        valuationAsOf: d.valuationAsOf ? d.valuationAsOf.toISOString() : null,
        // Deliberately no sheetRowId / "synced from sheet" field of any kind —
        // Q42 is held structurally (the type has no such key), not just hidden
        // by the renderer.
      };
    }),
  };
}
