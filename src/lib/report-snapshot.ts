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
}

export interface DealSnapshot {
  investmentType: string;
  dealDate: string; // ISO
  amountUsd: number;
  entryValuationUsd: number | null;
  currentValuationUsd: number | null;
  multiple: number | null; // currentValuation / entryValuation; 0 = written off; null = unknown
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

export function buildMentionSnapshot(companyName: string, country: string | null, deals: DealInput[]): MentionSnapshot {
  const sorted = [...deals].sort((a, b) => a.dealDate.getTime() - b.dealDate.getTime());
  const firstDeal = sorted[0];

  const dealSnapshots: DealSnapshot[] = sorted.map((d) => ({
    investmentType: d.investmentType,
    dealDate: d.dealDate.toISOString(),
    amountUsd: d.amountUsd,
    entryValuationUsd: d.entryValuation,
    currentValuationUsd: d.currentValuation,
    multiple: computeMultiple(d.entryValuation, d.currentValuation),
  }));

  const totalInvestedUsd = deals.reduce((sum, d) => sum + d.amountUsd, 0);

  return {
    companyName,
    country,
    firstDealDate: firstDeal ? firstDeal.dealDate.toISOString() : new Date(0).toISOString(),
    sinceFirstCheckMultiple: firstDeal ? computeMultiple(firstDeal.entryValuation, firstDeal.currentValuation) : null,
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
