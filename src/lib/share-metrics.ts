import type { Prisma } from "@prisma/client";

// Pure logic behind the share endpoint's metric summary, extracted from
// src/app/api/share/[token]/route.ts so the scoping rules (Q1 = B, WS12)
// are unit-testable — same pattern as route-access.ts and metric-alerts.ts.

/** Normalize a period-end date to the last instant of that UTC day. */
export function endOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export interface MetricScopeSource {
  metricScope: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Whether the link pins explicit updates (new-style links). */
  hasSelectedUpdates: boolean;
}

/**
 * Date filter for the metric summary query.
 *
 * "PERIOD" (opt-in, Q1 = B) scopes to the link's period, end-of-day
 * inclusive; the default "ALL_TIME" preserves pre-existing behavior
 * exactly for every link created before metricScope existed: no date
 * filter for pinned-update links, the raw period range for legacy
 * period-only links.
 */
export function buildMetricDateFilter(link: MetricScopeSource): Prisma.MetricValueWhereInput {
  if (link.metricScope === "PERIOD" && link.periodStart && link.periodEnd) {
    return { date: { gte: link.periodStart, lte: endOfDayUTC(link.periodEnd) } };
  }
  if (link.hasSelectedUpdates || !link.periodStart || !link.periodEnd) {
    return {}; // unchanged pre-existing behavior for ALL_TIME links
  }
  return { date: { gte: link.periodStart, lte: link.periodEnd } };
}

export interface ShareMetricValueRow {
  value: number | string | { toString(): string };
  date: Date;
  metricDefinition: { name: string; unit: string | null; companyId: string };
}

export interface ShareMetricSummaryEntry {
  name: string;
  unit: string | null;
  value: number;
  date: string;
}

/**
 * Per-company metric summary: latest value per (company, metric) pair.
 * Rows must already be sorted date-descending (the query orders by
 * `date: "desc"`); the first row seen per pair wins.
 */
export function buildMetricSummary(
  metricValues: ShareMetricValueRow[]
): Record<string, ShareMetricSummaryEntry[]> {
  const metricsByCompany: Record<string, ShareMetricSummaryEntry[]> = {};
  const seen = new Set<string>();
  for (const mv of metricValues) {
    const key = `${mv.metricDefinition.companyId}:${mv.metricDefinition.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      const cid = mv.metricDefinition.companyId;
      if (!metricsByCompany[cid]) metricsByCompany[cid] = [];
      metricsByCompany[cid].push({
        name: mv.metricDefinition.name,
        unit: mv.metricDefinition.unit,
        value: Number(mv.value),
        date: mv.date.toISOString(),
      });
    }
  }
  return metricsByCompany;
}
