// Deal Ledger helpers (admin/portfolio). Pure and DB-free.
//
// F103: the "multiple" shown anywhere must come from positionValue (which is
// dilution-aware once ownershipPct is known), never from a raw entry/current
// ratio. These were inline in the page; moved here in UI overhaul phase 3 so the
// summary strip can be recomputed from whichever rows the table currently shows.

export interface LedgerDeal {
  amountUsd: number;
  positionValue: number | null;
  dilutionAware: boolean;
  fund: { id: string };
  portfolioCompany: { id: string };
}

export function multipleValue(d: Pick<LedgerDeal, "amountUsd" | "positionValue">): number | null {
  if (d.positionValue === null || d.amountUsd <= 0) return null;
  return d.positionValue / d.amountUsd;
}

export function multipleLabel(d: Pick<LedgerDeal, "amountUsd" | "positionValue">): string {
  const m = multipleValue(d);
  if (m === null) return "n/a";
  if (d.positionValue === 0) return "Written off";
  return `${m.toFixed(1)}×`;
}

export interface LedgerSummary {
  totalInvested: number;
  dealCount: number;
  companyCount: number;
  fundCount: number;
  blendedImpliedValue: number;
  anyDilutionAware: boolean;
}

/** Same arithmetic as GET /api/admin/portfolio's summary, over any subset of deals. */
export function summarizeLedger(deals: readonly LedgerDeal[]): LedgerSummary {
  let totalInvested = 0;
  let blendedImpliedValue = 0;
  let anyDilutionAware = false;
  const companies = new Set<string>();
  const funds = new Set<string>();
  for (const d of deals) {
    totalInvested += d.amountUsd;
    if (d.positionValue !== null) blendedImpliedValue += d.positionValue;
    if (d.dilutionAware) anyDilutionAware = true;
    companies.add(d.portfolioCompany.id);
    funds.add(d.fund.id);
  }
  return {
    totalInvested,
    dealCount: deals.length,
    companyCount: companies.size,
    fundCount: funds.size,
    blendedImpliedValue,
    anyDilutionAware,
  };
}

/**
 * Blended multiple for a group of deals: implied value over the amount invested
 * in the deals that have an implied value (deals without one would drag the
 * ratio down for no reason). Null when nothing can be valued.
 */
export function blendedMultiple(deals: readonly Pick<LedgerDeal, "amountUsd" | "positionValue">[]): number | null {
  let invested = 0;
  let implied = 0;
  for (const d of deals) {
    if (d.positionValue === null) continue;
    invested += d.amountUsd;
    implied += d.positionValue;
  }
  return invested > 0 ? implied / invested : null;
}
