import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishUpdate } from "@/lib/publish-update";

// Vercel Cron invokes scheduled jobs with GET; POST is kept for manual
// testing with the CRON_SECRET. Both share the same handler (matches
// api/cron/reminders/route.ts and api/cron/alerts/route.ts).
async function handleScheduledPublish(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await db.update.findMany({
    where: { status: "DRAFT", scheduledFor: { lte: new Date() } },
    select: { id: true },
  });

  let published = 0;
  let failed = 0;
  for (const u of due) {
    try {
      const result = await publishUpdate(u.id);
      if (result) published++;
      else failed++;
    } catch (err) {
      console.error(`scheduled publish failed for ${u.id}:`, err);
      failed++;
    }
  }

  console.log(`[cron/scheduled-publish] published=${published} failed=${failed}`);
  return Response.json({ published, failed });
}

export async function GET(req: NextRequest) {
  return handleScheduledPublish(req);
}

export async function POST(req: NextRequest) {
  return handleScheduledPublish(req);
}
