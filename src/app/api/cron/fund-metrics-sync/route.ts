export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { fundMetricsSyncEnabled } from "@/lib/sheets";
import { runFundMetricsSync } from "@/lib/fund-metrics-sync-runner";

// Part 36, WS103.4 — weekly automatic fund-metrics sync. Same shared
// GET+POST CRON_SECRET pattern as api/cron/sheets-sync/route.ts (and
// api/cron/alerts, api/cron/reminders). "/api/cron" is already in
// PUBLIC_PREFIXES (route-access.ts) so no middleware change is needed here
// — Vercel Cron invocations carry no session, and this route's own
// CRON_SECRET check is the real gate.
//
// Ground rule 4 (fork story): with FUND_METRICS_SPREADSHEET_ID (or the
// shared Google env vars) absent, this no-ops with a 200 and a logged
// skip — never an error, never blocking.
async function handleSync(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!fundMetricsSyncEnabled()) {
    console.log("[cron/fund-metrics-sync] skipped — fund-metrics sheet env vars not configured");
    return Response.json({ skipped: true, reason: "fund-metrics sync not configured" });
  }

  // JC20 (Part 10) — cron-triggered syncs log as this fixed actor (nullable
  // actorId, required actorEmail string — no schema change needed).
  const result = await runFundMetricsSync("CRON", { email: "fund-metrics-sync@cron" });

  // Aggregate counts only — never the diff itself (confidentiality, ground rule 1).
  console.log(
    `[cron/fund-metrics-sync] status=${result.status} fundsUpdated=${result.summary?.fundsUpdated ?? 0} fieldsUpdated=${result.summary?.fieldsUpdated ?? 0} sheetOnlyIds=${result.summary?.crosscheck.sheetOnlyIds.length ?? 0} mollyOnlyIds=${result.summary?.crosscheck.mollyOnlyIds.length ?? 0}`
  );

  return Response.json({ runId: result.runId, status: result.status });
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
