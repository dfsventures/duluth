export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { slackDigestEnabled, postToSlack } from "@/lib/slack";

// Part 37, WS111.3. Mirrors /api/admin/test-email. The webhook URL is a secret:
// it is never returned, logged, or put in audit metadata.
export async function POST() {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    if (!slackDigestEnabled()) {
      return NextResponse.json(
        { error: "SLACK_DIGEST_WEBHOOK_URL is not set. Add it to your environment variables." },
        { status: 400 }
      );
    }

    const r = await postToSlack("Molly test post: the Slack integration is working.");
    if (!r.ok) {
      console.error("POST /api/admin/integrations/slack/test failed:", r.error);
      return NextResponse.json({ error: `Slack post failed (${r.error}).` }, { status: 502 });
    }

    await logAdminAction(user!, "SLACK_TEST_POSTED");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/admin/integrations/slack/test error:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
