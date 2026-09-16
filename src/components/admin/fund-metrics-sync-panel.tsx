"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Eye, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

// Part 36, WS103.3 — a sibling sub-section inside the EXISTING Sync tab on
// /admin/funds (not a new sidebar item — Part 11/WS28 deliberately
// consolidated sync onto this one tab, and re-fragmenting it would undo
// that). Structurally modelled on sync-panel.tsx, minus the one-time
// deal-linking disclosure (that's a deals-sync-only concept).

interface FundMetricsUpdateRow {
  fundId: string;
  slug: string;
  field: "grossMoicOverride" | "netTvpiOverride" | "netIrrOverride" | "netNavOverride";
  from: number | null;
  to: number | null;
}

interface FundMetricsCrosscheck {
  sheetOnlyIds: string[];
  mollyOnlyIds: string[];
  duplicateSheetIds: string[];
}

interface FundMetricsErrorSummary {
  unmatchedColumns: string[];
  missingRows: string[];
  badCells: { fundSlug: string; metric: string; value: string }[];
}

interface FundMetricsSummary {
  fundsUpdated: number;
  fieldsUpdated: number;
  crosscheck: FundMetricsCrosscheck;
  errors: FundMetricsErrorSummary;
  diff?: { updates: FundMetricsUpdateRow[] };
}

interface FundMetricsRun {
  id: string;
  trigger: "CRON" | "MANUAL" | "DRY_RUN";
  status: "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  summary: FundMetricsSummary | null;
  error: string | null;
}

const FIELD_LABELS: Record<FundMetricsUpdateRow["field"], string> = {
  grossMoicOverride: "Gross MOIC",
  netTvpiOverride: "Net TVPI",
  netIrrOverride: "Net IRR",
  netNavOverride: "Net NAV",
};

function formatMetricValue(field: FundMetricsUpdateRow["field"], value: number | null): string {
  if (value === null) return "—";
  // Display only — netIrrOverride is stored as a fraction (Q89), so this
  // panel renders it the same way the Performance card does. Never used to
  // decide what gets written; that decision is already made by the diff.
  if (field === "netIrrOverride") return `${(value * 100).toFixed(1)}%`;
  if (field === "netNavOverride") return `$${Math.round(value).toLocaleString()}`;
  return `${value.toFixed(2)}x`;
}

function crosscheckLine(c: FundMetricsCrosscheck): string {
  return `Deal ID crosscheck: ${c.sheetOnlyIds.length} in the sheet not in Molly, ${c.mollyOnlyIds.length} in Molly not in the sheet.`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function FundMetricsSyncPanel() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [runs, setRuns] = useState<FundMetricsRun[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/fund-metrics-sync");
      if (!res.ok) throw new Error("Failed to load fund-metrics sync status");
      const data: { enabled: boolean; runs: FundMetricsRun[] } = await res.json();
      setEnabled(data.enabled);
      setRuns(data.runs);
    } catch {
      setMessage({ type: "error", text: "Failed to load fund-metrics sync status." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runSync(dryRun: boolean) {
    const setBusy = dryRun ? setPreviewing : setSyncing;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/fund-metrics-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Sync failed");
      const s: FundMetricsSummary | undefined = data.summary;
      setMessage({
        type: "success",
        text: dryRun
          ? `Preview complete — ${s?.diff?.updates.length ?? 0} value(s) would change.`
          : `Sync complete — ${s?.fundsUpdated ?? 0} fund(s) updated, ${s?.fieldsUpdated ?? 0} field(s) changed.`,
      });
      setExpandedId(data.runId);
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Sync failed." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-8 w-8" />}
        title="Fund-metrics sync is not configured"
        description="Set GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY, and FUND_METRICS_SPREADSHEET_ID to enable this."
      />
    );
  }

  const lastSuccess = runs.find((r) => r.status === "SUCCESS" && r.trigger !== "DRY_RUN");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Fund Metrics</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            One-way sync from a second, separate spreadsheet — Gross MOIC, Net TVPI, Net IRR, and Net NAV per fund.
            Net DPI and the visibility checkboxes are never touched by this sync.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={previewing} onClick={() => runSync(true)}>
            <Eye className="mr-2 h-3.5 w-3.5" />
            {previewing ? "Previewing..." : "Preview changes (dry run)"}
          </Button>
          <Button size="sm" disabled={syncing} onClick={() => runSync(false)}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            {syncing ? "Syncing..." : "Sync now"}
          </Button>
        </div>
      </div>

      <div className="mb-6 rounded-md border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">
          Last successful sync:{" "}
          <span className="font-medium text-foreground">{lastSuccess ? formatTimestamp(lastSuccess.startedAt) : "never"}</span>
        </p>
        <p className="mt-1 text-muted-foreground">Weekly cron runs Mondays at 08:30 UTC (30 minutes after the deals sync above).</p>
      </div>

      {message && (
        <div
          className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
            message.type === "success" ? "border-acacia/30 bg-acacia/10 text-acacia" : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <h3 className="mb-3 font-semibold">Run history</h3>
      {runs.length === 0 ? (
        <EmptyState icon={<RefreshCw className="h-6 w-6" />} title="No fund-metrics syncs run yet" />
      ) : (
        <div className="space-y-2">
          {runs.map((r) => {
            const isExpanded = expandedId === r.id;
            const s = r.summary;
            return (
              <div key={r.id} className="rounded-md border border-border bg-card">
                <button
                  className="flex w-full flex-col gap-1 p-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.status === "SUCCESS" ? "success" : "danger"}>{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{r.trigger}</span>
                      <span className="text-sm">{formatTimestamp(r.startedAt)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s ? `${s.diff?.updates.length ?? 0} value(s) — ${s.fundsUpdated} fund(s) written` : r.error ?? ""}
                    </div>
                  </div>
                  {/* Q85-A (LOCKED): non-blocking, so this line is the ONLY
                      signal an admin gets of a real divergence. Mandatory
                      on the collapsed row, never buried in a disclosure. */}
                  {s && (
                    <p className={`text-xs ${s.crosscheck.sheetOnlyIds.length + s.crosscheck.mollyOnlyIds.length > 0 ? "text-ochre" : "text-muted-foreground"}`}>
                      {crosscheckLine(s.crosscheck)}
                      {s.crosscheck.duplicateSheetIds.length > 0 && ` ${s.crosscheck.duplicateSheetIds.length} duplicate ID(s) in the sheet.`}
                    </p>
                  )}
                </button>
                {isExpanded && s && (
                  <div className="border-t border-border p-3 text-xs">
                    {r.error && <p className="text-laterite">{r.error}</p>}

                    {s.diff && s.diff.updates.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 font-medium">From → to:</p>
                        <ul className="space-y-0.5 font-mono text-muted-foreground">
                          {s.diff.updates.map((u, i) => (
                            <li key={i}>
                              {u.slug} · {FIELD_LABELS[u.field]}: {formatMetricValue(u.field, u.from)} → {formatMetricValue(u.field, u.to)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {s.diff && s.diff.updates.length === 0 && <p className="mb-3 text-muted-foreground">No value changes.</p>}

                    {s.errors.unmatchedColumns.length > 0 && (
                      <p className="mb-1 text-muted-foreground">
                        Columns ignored (not Molly funds): {s.errors.unmatchedColumns.join(", ")}
                      </p>
                    )}
                    {s.errors.missingRows.length > 0 && (
                      <p className="mb-1 text-ochre">Metric row(s) not found in the sheet: {s.errors.missingRows.join(", ")}</p>
                    )}
                    {s.errors.badCells.length > 0 && (
                      <p className="mb-1 text-ochre">
                        Unparseable cells: {s.errors.badCells.map((b) => `${b.fundSlug} ${b.metric}`).join(", ")}
                      </p>
                    )}
                    {s.crosscheck.sheetOnlyIds.length > 0 && (
                      <p className="mb-1 text-ochre">In the sheet, not in Molly: {s.crosscheck.sheetOnlyIds.join(", ")}</p>
                    )}
                    {s.crosscheck.mollyOnlyIds.length > 0 && (
                      <p className="mb-1 text-ochre">In Molly, not in the sheet: {s.crosscheck.mollyOnlyIds.join(", ")}</p>
                    )}
                    {s.crosscheck.duplicateSheetIds.length > 0 && (
                      <p className="mb-1 text-ochre">Duplicate IDs in the sheet: {s.crosscheck.duplicateSheetIds.join(", ")}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
