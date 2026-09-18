// Pure helpers behind fund-report mention snapshots (Part 7, WS17.2),
// extracted so the publish-time freeze logic is unit-testable — same
// pattern as route-access.ts / metric-alerts.ts / share-metrics.ts.
//
// Q6 (decided 2026-07-08): the hover card leads with the SINCE-FIRST-CHECK
// multiple (the earliest deal's entry valuation -> its current valuation),
// NOT a blended multiple across follow-ons — with a per-deal breakdown
// beneath. The WS17.2 hover-card detail flag is FULL detail: DFS check
// sizes, multiples, AND entry -> current valuations in dollars.

export interface DealInput {
  investmentType: string; // "INITIAL" | "FOLLOW_ON"
  dealDate: Date;
  amountUsd: number; // caller Number()s Prisma Decimals, house convention
  entryValuation: number | null;
  currentValuation: number | null;
  // F103 follow-up — optional, so a caller that doesn't have it (or hasn't
  // been updated) gets exactly today's raw-ratio behavior; positionValue()
  // treats a missing/null ownershipPct as "not known" either way.
  ownershipPct: number | null;
}

export interface DealSnapshot {
  investmentType: string;
  dealDate: string; // ISO
  amountUsd: number;
  entryValuationUsd: number | null;
  currentValuationUsd: number | null;
  // F103 follow-up — derived via positionValue(), dilution-aware when the
  // deal's ownershipPct is known; byte-identical to the old bare
  // computeMultiple() result when it isn't (0 = written off; null = unknown).
  multiple: number | null;
}

export interface MentionSnapshot {
  companyName: string;
  country: string | null;
  firstDealDate: string; // ISO — the earliest deal, for "since first check (Oct 2020)"
  /** Multiple from the first deal's entry valuation to its current valuation. */
  sinceFirstCheckMultiple: number | null;
  firstCheckEntryValuationUsd: number | null;
  firstCheckCurrentValuationUsd: number | null;
  totalInvestedUsd: number; // Σ amountUsd across all deals — full detail (DFS check sizes)
  deals: DealSnapshot[]; // per-deal breakdown beneath the headline, full detail
}

/** entryValuation > 0 && currentValuation != null -> current/entry; currentValuation === 0 -> 0 ("written off"); otherwise null ("n/a"). */
export function computeMultiple(entryValuation: number | null, currentValuation: number | null): number | null {
  if (entryValuation !== null && entryValuation > 0 && currentValuation !== null) {
    return currentValuation / entryValuation;
  }
  return null;
}

// Moved here from portfolio-metrics.ts (F103 follow-up) so buildMentionSnapshot
// below can use it without an import cycle (portfolio-metrics.ts already
// imports computeMultiple from this file). portfolio-metrics.ts re-exports
// positionValue so every existing `import { positionValue } from
// "@/lib/portfolio-metrics"` call site is unaffected by the move.

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

// F103 follow-up — derives the dilution-aware effective multiple
// (positionValue / amountUsd) for one deal, falling back to the old raw
// entry/current ratio when ownershipPct isn't known (byte-identical for
// every deal that doesn't have one set).
function effectiveMultiple(d: DealInput): number | null {
  const pv = positionValue({ amountUsd: d.amountUsd, entryValuation: d.entryValuation, currentValuation: d.currentValuation, ownershipPct: d.ownershipPct }, d.currentValuation);
  return pv.value !== null && d.amountUsd > 0 ? pv.value / d.amountUsd : null;
}

export function buildMentionSnapshot(companyName: string, country: string | null, deals: DealInput[]): MentionSnapshot {
  const sorted = [...deals].sort((a, b) => a.dealDate.getTime() - b.dealDate.getTime());
  const firstDeal = sorted[0];

  const dealSnapshots: DealSnapshot[] = sorted.map((d) => ({
    investmentType: d.investmentType,
    dealDate: d.dealDate.toISOString(),
    amountUsd: d.amountUsd,
    entryValuationUsd: d.entryValuation,
    currentValuationUsd: d.currentValuation,
    multiple: effectiveMultiple(d),
  }));

  const totalInvestedUsd = deals.reduce((sum, d) => sum + d.amountUsd, 0);

  return {
    companyName,
    country,
    firstDealDate: firstDeal ? firstDeal.dealDate.toISOString() : new Date(0).toISOString(),
    sinceFirstCheckMultiple: firstDeal ? effectiveMultiple(firstDeal) : null,
    firstCheckEntryValuationUsd: firstDeal ? firstDeal.entryValuation : null,
    firstCheckCurrentValuationUsd: firstDeal ? firstDeal.currentValuation : null,
    totalInvestedUsd,
    deals: dealSnapshots,
  };
}

/** Extract distinct portfolio-company ids mentioned in report HTML (matches portco-mention.ts's renderHTML). */
export function extractMentionIds(html: string): string[] {
  const ids = new Set<string>();
  const re = /data-portco="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    ids.add(match[1]);
  }
  return [...ids];
}

/**
 * Part 14, WS33.4 — sibling of extractMentionIds. Detects whether the report
 * body contains a fund-snapshot block marker (matches fund-snapshot-node.ts's
 * renderHTML: `data-fund-snapshot="true"`). A report is single-fund-scoped
 * (Q43), so unlike mentions there's no id to extract — just presence/absence.
 */
export function hasFundSnapshotMarker(html: string): boolean {
  return /data-fund-snapshot="true"/.test(html);
}
