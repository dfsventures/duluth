// Pure, tested rule evaluator for portfolio metric alerts (WS10). Mirrors the
// route-access.ts extract-and-test pattern: no db/network access here, just
// plain data in, fired alerts out.

export const DEFAULT_CHANGE_PCT = 20; // override via METRIC_ALERT_CHANGE_PCT env (server-only)

export interface MetricSeries {
  metricDefinitionId: string;
  name: string;
  unit: string | null;
  values: { value: number; date: Date }[]; // sorted date desc, up to 5
}

export interface CompanySnapshot {
  companyId: string;
  companyName: string;
  metricDefinitionCount: number;
  series: MetricSeries[];
  // newest-first, up to 3, published only
  lastPublishedUpdates: { id: string; metricValueCount: number }[];
}

export interface FiredAlert {
  rule: "METRIC_CHANGE" | "NO_METRICS_IN_UPDATES";
  companyId: string;
  metricDefinitionId?: string;
  message: string;
  dedupeKey: string;
  metadata: Record<string, unknown>;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function evaluateCompanyAlerts(
  snap: CompanySnapshot,
  changePct: number = DEFAULT_CHANGE_PCT
): FiredAlert[] {
  const alerts: FiredAlert[] = [];

  // Rule 1 — METRIC_CHANGE
  for (const series of snap.series) {
    // Find the latest value and the next-earlier value on a distinct date.
    const sorted = [...series.values].sort((a, b) => b.date.getTime() - a.date.getTime());
    if (sorted.length < 2) continue;

    const latest = sorted[0];
    const previous = sorted.find((v) => v.date.getTime() !== latest.date.getTime());
    if (!previous) continue; // all values share the same date

    if (previous.value === 0) continue; // undefined percentage change

    const changeFraction = (latest.value - previous.value) / previous.value;
    const changePctActual = changeFraction * 100;

    if (Math.abs(changePctActual) >= changePct) {
      const rounded = Math.round(changePctActual * 10) / 10;
      const sign = rounded > 0 ? "+" : "";
      alerts.push({
        rule: "METRIC_CHANGE",
        companyId: snap.companyId,
        metricDefinitionId: series.metricDefinitionId,
        message: `${series.name} changed ${sign}${rounded}% (${formatValue(previous.value)} → ${formatValue(latest.value)})`,
        dedupeKey: `METRIC_CHANGE:${snap.companyId}:${series.metricDefinitionId}:${latest.date.toISOString()}`,
        metadata: {
          previousValue: previous.value,
          latestValue: latest.value,
          changePct: rounded,
          previousDate: previous.date.toISOString(),
          latestDate: latest.date.toISOString(),
        },
      });
    }
  }

  // Rule 2 — NO_METRICS_IN_UPDATES
  if (
    snap.metricDefinitionCount > 0 &&
    snap.lastPublishedUpdates.length >= 3 &&
    snap.lastPublishedUpdates.every((u) => u.metricValueCount === 0)
  ) {
    alerts.push({
      rule: "NO_METRICS_IN_UPDATES",
      companyId: snap.companyId,
      message: "No metrics attached to the last 3 updates",
      dedupeKey: `NO_METRICS_IN_UPDATES:${snap.companyId}:${snap.lastPublishedUpdates[0].id}`,
      metadata: {
        lastPublishedUpdateIds: snap.lastPublishedUpdates.map((u) => u.id),
      },
    });
  }

  return alerts;
}
