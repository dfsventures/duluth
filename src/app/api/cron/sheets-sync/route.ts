export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { sheetsSyncEnabled } from "@/lib/sheets";
import { runSheetSync } from "@/lib/sheet-sync-runner";

// Part 10, WS27.4 — weekly automatic sync. Same shared GET+POST
// CRON_SECRET pattern as api/cron/alerts/route.ts and api/cron/reminders.
// "/api/cron" is already in PUBLIC_PREFIXES (route-access.ts) so no
// middleware change is needed here — Vercel Cron invocations carry no
// session, and this route's own CRON_SECRET check is the real gate (the
// "/api/cron, /brand, /api/share" family bug, avoided here from the start).
//
// Ground rule 4 (fork story): with the three Google env vars absent, this
// no-ops with a 200 and a logged skip — never an error, never blocking.
async function handleSync(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sheetsSyncEnabled()) {
    console.log("[cron/sheets-sync] skipped — Google Sheets env vars not configured");
    return Response.json({ skipped: true, reason: "sheets sync not configured" });
  }

  // JC20 — cron-triggered syncs log as this fixed actor (nullable actorId,
  // required actorEmail string — no schema change needed).
  const result = await runSheetSync("CRON", { email: "sheets-sync@cron" });

  // Aggregate counts only — never the diff itself (confidentiality, ground rule 1).
  console.log(
    `[cron/sheets-sync] status=${result.status} dealsCreated=${result.summary?.dealsCreated ?? 0} fieldsUpdated=${result.summary?.fieldsUpdated ?? 0} marksCreated=${result.summary?.marksCreated ?? 0}`
  );

  return Response.json({ runId: result.runId, status: result.status });
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
