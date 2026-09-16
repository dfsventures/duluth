// Part 36, WS102.4 — the DB-touching half of the second, independent
// one-way Google Sheets sync (D1). Structurally mirrors sheet-sync-runner.ts:
// this file is the shared implementation behind both the weekly cron route
// and the manual "Sync now" / "Preview" admin route.
//
// CONFIDENTIALITY: SheetSyncRun.summary carries real MOIC/TVPI/IRR/NAV
// values (ground rule 1) — requireAdmin-gated at every read, and never
// logged to the console beyond aggregate counts.

import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import { getSheetValues, fundMetricsSyncEnabled, FUND_METRICS_RANGE } from "@/lib/sheets";
import { computeFundMetricsDiff, type FundMetricsDiff, type KnownFundSlug, type FundMetricsCurrentValues } from "@/lib/fund-metrics-sync";

export type FundMetricsSyncTrigger = "CRON" | "MANUAL" | "DRY_RUN";

export interface FundMetricsSyncSummary {
  fundsUpdated: number;
  fieldsUpdated: number;
  crosscheck: FundMetricsDiff["crosscheck"];
  errors: FundMetricsDiff["errors"];
  // Present only for a stored preview/history detail — never logged.
  diff?: FundMetricsDiff;
}

export interface FundMetricsSyncResult {
  runId: string;
  trigger: FundMetricsSyncTrigger;
  status: "SUCCESS" | "FAILED";
  summary: FundMetricsSyncSummary | null;
  error: string | null;
}

async function loadFundMetricsSyncInputs(): Promise<{
  knownFunds: KnownFundSlug[];
  currentValues: Record<string, FundMetricsCurrentValues>;
  dbSheetRowIds: string[];
}> {
  const [funds, deals] = await Promise.all([
    db.fund.findMany({
      // Note: slug, not name (F97) — the fund-metrics sheet's summary-block
      // column headers are vehicle codes, and slug is the immutable import
      // key, unlike the deals sync's Vehicle-cell-vs-name match.
      select: { id: true, slug: true, grossMoicOverride: true, netTvpiOverride: true, netIrrOverride: true, netNavOverride: true },
    }),
    db.deal.findMany({ where: { sheetRowId: { not: null } }, select: { sheetRowId: true } }),
  ]);

  const knownFunds: KnownFundSlug[] = funds.map((f) => ({ id: f.id, slug: f.slug }));
  const currentValues: Record<string, FundMetricsCurrentValues> = {};
  for (const f of funds) {
    currentValues[f.id] = {
      grossMoicOverride: f.grossMoicOverride !== null ? Number(f.grossMoicOverride) : null,
      netTvpiOverride: f.netTvpiOverride !== null ? Number(f.netTvpiOverride) : null,
      netIrrOverride: f.netIrrOverride !== null ? Number(f.netIrrOverride) : null,
      netNavOverride: f.netNavOverride !== null ? Number(f.netNavOverride) : null,
    };
  }
  const dbSheetRowIds = deals.map((d) => d.sheetRowId as string);

  return { knownFunds, currentValues, dbSheetRowIds };
}

/**
 * Applies a computed diff. Groups updates by fundId so each fund gets a
 * single db.fund.update() plus a single FUND_UPDATED audit row (reusing the
 * existing action name so /admin/audit and Part 15/Q51's provenance story
 * keep working — `source` distinguishes it, exactly as the deals sync does
 * with `{ source: "SHEET" }`). Never touches netDpiOverride or any show*
 * flag (D2, JC-FM-D) — the FundMetricsUpdate.field union makes that
 * structurally true, not just a convention followed here.
 */
async function applyFundMetricsDiff(diff: FundMetricsDiff, actor: { id?: string; email?: string | null }): Promise<{ fundsUpdated: number; fieldsUpdated: number }> {
  const byFund = new Map<string, typeof diff.updates>();
  for (const u of diff.updates) {
    const list = byFund.get(u.fundId) ?? [];
    list.push(u);
    byFund.set(u.fundId, list);
  }

  let fundsUpdated = 0;
  let fieldsUpdated = 0;
  for (const [fundId, updates] of byFund) {
    const data: Record<string, number | null> = {};
    for (const u of updates) data[u.field] = u.to;
    await db.fund.update({ where: { id: fundId }, data });
    fundsUpdated++;
    fieldsUpdated += updates.length;
    await logAdminAction(actor, "FUND_UPDATED", {
      targetType: "Fund",
      targetId: fundId,
      metadata: { source: "SHEET_FUND_METRICS", fields: updates.map((u) => u.field) },
    });
  }
  return { fundsUpdated, fieldsUpdated };
}

/**
 * Runs (or previews) one fund-metrics sync pass. `fundMetricsSyncEnabled()`
 * must be checked by the caller first (routes no-op cleanly when it's
 * false — ground rule 4); this function assumes it's already true.
 */
export async function runFundMetricsSync(trigger: FundMetricsSyncTrigger, actor: { id?: string; email?: string | null }): Promise<FundMetricsSyncResult> {
  const startedAt = new Date();
  try {
    const values = await getSheetValues(process.env.FUND_METRICS_SPREADSHEET_ID!, FUND_METRICS_RANGE);
    const { knownFunds, currentValues, dbSheetRowIds } = await loadFundMetricsSyncInputs();
    const diff = computeFundMetricsDiff(values, knownFunds, dbSheetRowIds, currentValues);

    let applied = { fundsUpdated: 0, fieldsUpdated: 0 };
    if (trigger !== "DRY_RUN") {
      // Part 36, Q87-(i) — a PERMANENT first-write safety gate, not an
      // incident gate to be cleaned up later (unlike SHEETS_SYNC_APPLY_
      // ENABLED, which it is modelled on and whose own comment says to
      // remove it after incident cleanup). This one stays: the first
      // non-dry-run apply overwrites hand-entered Gross MOIC/Net TVPI
      // values on at least two funds today (F92), so a deliberate human
      // "yes" after reading a dry run is cheap, permanent insurance.
      if (process.env.FUND_METRICS_SYNC_APPLY_ENABLED !== "true") {
        throw new Error(
          "Fund-metrics sync apply is disabled until a human reviews a dry run — dry-run previews still work. Set FUND_METRICS_SYNC_APPLY_ENABLED=true to enable real writes."
        );
      }
      applied = await applyFundMetricsDiff(diff, actor);
    }

    // Q85-A (LOCKED): the crosscheck is non-blocking. It is recorded in the
    // summary below and the apply above proceeds regardless — there is no
    // throw-on-mismatch branch here, by design.
    const summary: FundMetricsSyncSummary = { ...applied, crosscheck: diff.crosscheck, errors: diff.errors, diff };
    const run = await db.sheetSyncRun.create({
      data: {
        kind: "FUND_METRICS",
        trigger,
        status: "SUCCESS",
        startedAt,
        finishedAt: new Date(),
        summary: summary as unknown as object,
      },
    });
    return { runId: run.id, trigger, status: "SUCCESS", summary, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fund-metrics sync error";
    const run = await db.sheetSyncRun.create({
      data: { kind: "FUND_METRICS", trigger, status: "FAILED", startedAt, finishedAt: new Date(), error: message },
    });
    return { runId: run.id, trigger, status: "FAILED", summary: null, error: message };
  }
}

export { fundMetricsSyncEnabled };
