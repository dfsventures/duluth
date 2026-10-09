export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest } from "next/server";
import { granolaIntakeEnabled } from "@/lib/granola";
import { runGranolaSweep, safeErrorText } from "@/lib/granola-intake";

// Part 37, WS109.3 — daily safety-net sweep for Granola notes (the webhook,
// WS110, is the fast path). Same shared GET+POST CRON_SECRET pattern as
// api/cron/fund-metrics-sync. "/api/cron" is already public in route-access.ts;
// the secret check below is the real gate. No-ops with 200 when unconfigured.
async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!granolaIntakeEnabled()) {
    console.log("[cron/granola-sweep] skipped — Granola env vars not configured");
    return Response.json({ skipped: true, reason: "granola intake not configured" });
  }

  try {
    const s = await runGranolaSweep("SWEEP");
    console.log(
      `[cron/granola-sweep] enqueued=${s.enqueued} processed=${s.processed} skipped=${s.skipped} failed=${s.failed}`
    );
    return Response.json(s);
  } catch (err) {
    console.error(`[cron/granola-sweep] failed: ${safeErrorText(err)}`);
    return Response.json({ error: "Sweep failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
