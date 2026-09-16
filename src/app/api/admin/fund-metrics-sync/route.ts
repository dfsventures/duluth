export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { fundMetricsSyncEnabled } from "@/lib/sheets";
import { runFundMetricsSync } from "@/lib/fund-metrics-sync-runner";

// Part 36, WS103.1 — manual "Sync now" / "Preview changes (dry run)" plus
// the run-history feed for the "Fund Metrics" sub-section on the Sync tab
// at /admin/funds. Near-copy of api/admin/sheets-sync/route.ts, filtered to
// this sync's own kind. requireAdmin-gated: SheetSyncRun.summary carries
// real MOIC/TVPI/IRR/NAV values (ground rule 1), so it must never be
// reachable without a session, and never logged server-side beyond
// aggregate counts.

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const enabled = fundMetricsSyncEnabled();
  if (!enabled) return NextResponse.json({ enabled: false, runs: [] });

  const runs = await db.sheetSyncRun.findMany({ where: { kind: "FUND_METRICS" }, orderBy: { startedAt: "desc" }, take: 20 });
  return NextResponse.json({
    enabled: true,
    runs: runs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      summary: r.summary,
      error: r.error,
    })),
  });
}

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  if (!fundMetricsSyncEnabled()) {
    return NextResponse.json({ error: "Fund-metrics sheet sync is not configured (env vars absent)." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const dryRun = Boolean(body?.dryRun);

  const result = await runFundMetricsSync(dryRun ? "DRY_RUN" : "MANUAL", { id: user!.id, email: user!.email });

  if (result.status === "FAILED") {
    return NextResponse.json({ runId: result.runId, status: result.status, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    runId: result.runId,
    status: result.status,
    summary: result.summary,
  });
}
