"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Eye, AlertCircle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

// Part 10, WS27.6 — manual sync-now admin surface. Nav item for this page
// is itself gated on `enabled` (sidebar.tsx), and this page 404s-in-place
// (empty state) if hit directly while sync is disabled — ground rule 4.

interface SyncErrorSummary {
  duplicateIds: string[];
  missingIds: number[];
  unknownVehicles: { row: number; vehicle: string }[];
  badCells: { row: number; column: string; value: string }[];
}

interface SyncSummary {
  dealsCreated: number;
  companiesCreated: number;
  fieldsUpdated: number;
  marksCreated: number;
  errors: SyncErrorSummary;
  diff?: {
    creates: { sheetRowId: string; companyName: string }[];
    updates: { sheetRowId: string; dealId: string; field: string; from: unknown; to: unknown }[];
    newCompanies: string[];
  };
}

interface SyncRun {
  id: string;
  trigger: "CRON" | "MANUAL" | "DRY_RUN";
  status: "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  summary: SyncSummary | null;
  error: string | null;
}

function errorCount(errors: SyncErrorSummary): number {
  return errors.duplicateIds.length + errors.missingIds.length + errors.unknownVehicles.length + errors.badCells.length;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminSyncPage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sheets-sync");
      if (!res.ok) throw new Error("Failed to load sync status");
      const data: { enabled: boolean; runs: SyncRun[] } = await res.json();
      setEnabled(data.enabled);
      setRuns(data.runs);
    } catch {
      setMessage({ type: "error", text: "Failed to load sync status." });
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
      const res = await fetch("/api/admin/sheets-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Sync failed");
      const s: SyncSummary | undefined = data.summary;
      const errCount = s ? errorCount(s.errors) : 0;
      setMessage({
        type: "success",
        text: dryRun
          ? `Preview complete — ${s?.diff?.creates.length ?? 0} to create, ${s?.diff?.updates.length ?? 0} field update(s), ${errCount} to review.`
          : `Sync complete — ${s?.dealsCreated ?? 0} deal(s) created, ${s?.fieldsUpdated ?? 0} field update(s), ${s?.marksCreated ?? 0} valuation mark(s), ${errCount} to review.`,
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
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (!enabled) {
    return (
      <AppShell>
        <PageHeader title="Sheet Sync" description="One-way sync from the Deals tracker sheet." />
        <EmptyState
          icon={<RefreshCw className="h-8 w-8" />}
          title="Sheet sync is not configured"
          description="Set GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY, and SHEETS_SPREADSHEET_ID to enable this."
        />
      </AppShell>
    );
  }

  const lastSuccess = runs.find((r) => r.status === "SUCCESS" && r.trigger !== "DRY_RUN");

  return (
    <AppShell>
      <PageHeader
        title="Sheet Sync"
        description="One-way sync from the Deals tracker sheet — sheet-owned deal/valuation fields become read-only here while sync is enabled."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={previewing} onClick={() => runSync(true)}>
              <Eye className="mr-2 h-3.5 w-3.5" />
              {previewing ? "Previewing..." : "Preview changes (dry run)"}
            </Button>
            <Button size="sm" disabled={syncing} onClick={() => runSync(false)}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              {syncing ? "Syncing..." : "Sync now"}
            </Button>
          </div>
        }
      />

      <div className="mb-6 rounded-md border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">
          Last successful sync:{" "}
          <span className="font-medium text-foreground">{lastSuccess ? formatTimestamp(lastSuccess.startedAt) : "never"}</span>
        </p>
        <p className="mt-1 text-muted-foreground">Weekly cron runs Mondays at 08:00 UTC.</p>
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
        <EmptyState icon={<RefreshCw className="h-6 w-6" />} title="No syncs run yet" />
      ) : (
        <div className="space-y-2">
          {runs.map((r) => {
            const isExpanded = expandedId === r.id;
            const errCount = r.summary ? errorCount(r.summary.errors) : 0;
            return (
              <div key={r.id} className="rounded-md border border-border bg-card">
                <button
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={r.status === "SUCCESS" ? "success" : "danger"}>{r.status}</Badge>
                    <span className="text-xs text-muted-foreground">{r.trigger}</span>
                    <span className="text-sm">{formatTimestamp(r.startedAt)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.summary
                      ? `${r.summary.dealsCreated} created · ${r.summary.fieldsUpdated} updated · ${r.summary.marksCreated} marks · ${errCount} to review`
                      : r.error ?? ""}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-border p-3 text-xs">
                    {r.error && <p className="text-laterite">{r.error}</p>}
                    {r.summary?.diff && (
                      <div className="space-y-2">
                        {r.summary.diff.newCompanies.length > 0 && (
                          <p>
                            <span className="font-medium">New companies:</span> {r.summary.diff.newCompanies.join(", ")}
                          </p>
                        )}
                        {r.summary.diff.updates.length > 0 && (
                          <div>
                            <p className="mb-1 font-medium">Field updates:</p>
                            <ul className="space-y-0.5 font-mono text-muted-foreground">
                              {r.summary.diff.updates.map((u, i) => (
                                <li key={i}>
                                  {u.sheetRowId} · {u.field}: {String(u.from)} → {String(u.to)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {errCount > 0 && (
                          <div className="text-ochre">
                            {r.summary.errors.duplicateIds.length > 0 && <p>Duplicate IDs: {r.summary.errors.duplicateIds.join(", ")}</p>}
                            {r.summary.errors.missingIds.length > 0 && <p>Missing IDs on sheet rows: {r.summary.errors.missingIds.join(", ")}</p>}
                            {r.summary.errors.unknownVehicles.length > 0 && (
                              <p>Unknown vehicles: {r.summary.errors.unknownVehicles.map((v) => `row ${v.row} (${v.vehicle})`).join(", ")}</p>
                            )}
                            {r.summary.errors.badCells.length > 0 && (
                              <p>Bad cells: {r.summary.errors.badCells.map((b) => `row ${b.row} ${b.column}`).join(", ")}</p>
                            )}
                          </div>
                        )}
                        {r.summary.diff.updates.length === 0 && r.summary.diff.newCompanies.length === 0 && errCount === 0 && (
                          <p className="text-muted-foreground">No changes.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
