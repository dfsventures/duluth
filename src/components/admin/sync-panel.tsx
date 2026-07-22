"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Eye, AlertCircle, CheckCircle2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ComposerDisclosure } from "@/components/composer/composer-disclosure";

// Part 11, WS28 (Q30-B) — the Sync surface used to be its own top-level
// page at /admin/sync with its own sidebar nav item. Sync is a genuinely
// global integration (one spreadsheet feeds every fund's deals —
// SheetSyncRun carries no fundId, sheetsSyncEnabled() takes no fund
// argument), so rather than duplicate this panel identically on every
// single fund's detail page, it now lives as a "Sync" tab on the /admin/
// funds list page (src/app/admin/funds/page.tsx) — one place, same
// content regardless of which fund you came from. This component is the
// extracted panel body (no AppShell/PageHeader — the host page supplies
// those), otherwise unchanged from the old page.

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

// Part 10, WS27 one-time linking step — matches Molly's existing Deal rows
// to the sheet's "Stable ID column" values by content, so the recurring
// sync above can recognize them instead of treating them as new. See
// src/lib/sheet-link.ts / src/app/api/admin/sheets-sync/link/route.ts.

interface DealLinkMatch {
  dealId: string;
  companyName: string;
  vehicleName: string;
  stableId: string | null;
  status: "matched" | "ambiguous" | "unmatched" | "already-linked";
  detail?: string;
}

interface LinkCounts {
  total: number;
  matched: number;
  alreadyLinked: number;
  ambiguous: number;
  unmatched: number;
}

interface LinkPreviewResponse {
  applied: boolean;
  matches: DealLinkMatch[];
  counts: LinkCounts;
  error?: string;
}

const LINK_STATUS_VARIANT: Record<DealLinkMatch["status"], "success" | "danger" | "warning" | "neutral"> = {
  matched: "success",
  "already-linked": "neutral",
  ambiguous: "warning",
  unmatched: "danger",
};

function errorCount(errors: SyncErrorSummary): number {
  return errors.duplicateIds.length + errors.missingIds.length + errors.unknownVehicles.length + errors.badCells.length;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function SyncPanel() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [linkPreview, setLinkPreview] = useState<LinkPreviewResponse | null>(null);
  const [linkPreviewing, setLinkPreviewing] = useState(false);
  const [linkApplying, setLinkApplying] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  async function previewLink() {
    setLinkPreviewing(true);
    setLinkMessage(null);
    try {
      const res = await fetch("/api/admin/sheets-sync/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      const data: LinkPreviewResponse = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Preview failed");
      setLinkPreview(data);
    } catch (err) {
      setLinkPreview(null);
      setLinkMessage({ type: "error", text: err instanceof Error ? err.message : "Preview failed." });
    } finally {
      setLinkPreviewing(false);
    }
  }

  async function applyLink() {
    setLinkApplying(true);
    setLinkMessage(null);
    try {
      const res = await fetch("/api/admin/sheets-sync/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data: LinkPreviewResponse = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Apply failed");
      setLinkPreview(data);
      setLinkMessage({ type: "success", text: `Linked ${data.counts.matched} deal(s) to their sheet row. ${data.counts.alreadyLinked} were already linked.` });
    } catch (err) {
      setLinkMessage({ type: "error", text: err instanceof Error ? err.message : "Apply failed." });
    } finally {
      setLinkApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-8 w-8" />}
        title="Sheet sync is not configured"
        description="Set GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY, and SHEETS_SPREADSHEET_ID to enable this."
      />
    );
  }

  const lastSuccess = runs.find((r) => r.status === "SUCCESS" && r.trigger !== "DRY_RUN");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Sheet Sync</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            One-way sync from the Deals tracker sheet — sheet-owned deal/valuation fields become read-only here while sync is enabled.
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

      {/* Collapsed by default (unlike the status box above, this isn't
          auto-checked on load): a one-time bootstrapping step, already
          completed (verified 76/76 linked). "Is it still done" isn't a
          cheap local read — it calls out to the live Google Sheet — so
          silently re-fetching it on every page visit would add real
          latency/API cost for a question that essentially never changes
          once answered. Kept, not deleted, as a disaster-recovery tool:
          re-runnable by hand if a deal's sheetRowId ever needs re-linking. */}
      <div className="mb-6">
        <ComposerDisclosure label="Link existing deals to sheet rows (one-time setup)">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Link existing deals to sheet rows</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={linkPreviewing} onClick={previewLink}>
                  <Eye className="mr-2 h-3.5 w-3.5" />
                  {linkPreviewing ? "Previewing..." : "Preview matches"}
                </Button>
                <Button
                  size="sm"
                  disabled={linkApplying || !linkPreview || linkPreview.counts.ambiguous > 0 || linkPreview.counts.unmatched > 0 || linkPreview.counts.matched === 0}
                  onClick={applyLink}
                >
                  <Link2 className="mr-2 h-3.5 w-3.5" />
                  {linkApplying ? "Applying..." : "Apply links"}
                </Button>
              </div>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              One-time step: matches each of Molly&apos;s existing deals to a row in the live sheet by company, vehicle, investment type, and date, then
              writes the sheet&apos;s Stable ID onto the deal. Required once before the recurring sync above can recognize existing deals instead of
              treating them as new. Idempotent — already-linked deals are always skipped. Refuses to apply if any deal is ambiguous or unmatched.
            </p>

            {linkMessage && (
              <div
                className={`mb-3 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
                  linkMessage.type === "success" ? "border-acacia/30 bg-acacia/10 text-acacia" : "border-laterite/30 bg-laterite/10 text-laterite"
                }`}
              >
                {linkMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {linkMessage.text}
              </div>
            )}

            {linkPreview && (
              <div>
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <Badge variant="success">{linkPreview.counts.matched} matched</Badge>
                  <Badge variant="neutral">{linkPreview.counts.alreadyLinked} already linked</Badge>
                  <Badge variant="warning">{linkPreview.counts.ambiguous} ambiguous</Badge>
                  <Badge variant="danger">{linkPreview.counts.unmatched} unmatched</Badge>
                </div>
                {linkPreview.counts.ambiguous === 0 && linkPreview.counts.unmatched === 0 && linkPreview.counts.matched === 0 && (
                  <p className="mb-2 text-sm text-muted-foreground">All deals are already linked — nothing to apply.</p>
                )}
                {(linkPreview.counts.ambiguous > 0 || linkPreview.counts.unmatched > 0) && (
                  <p className="mb-2 text-sm text-ochre">
                    Apply is disabled until every deal is matched or already-linked — this is all-or-nothing by design for a one-time operation.
                  </p>
                )}
                <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-left">
                        <th className="p-2 font-medium">Company</th>
                        <th className="p-2 font-medium">Vehicle</th>
                        <th className="p-2 font-medium">Status</th>
                        <th className="p-2 font-medium">Stable ID / detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkPreview.matches.map((m) => (
                        <tr key={m.dealId} className="border-b border-border last:border-0">
                          <td className="p-2">{m.companyName}</td>
                          <td className="p-2">{m.vehicleName}</td>
                          <td className="p-2">
                            <Badge variant={LINK_STATUS_VARIANT[m.status]}>{m.status}</Badge>
                          </td>
                          <td className="p-2 font-mono text-muted-foreground">{m.stableId ?? m.detail ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </ComposerDisclosure>
      </div>

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
    </div>
  );
}
