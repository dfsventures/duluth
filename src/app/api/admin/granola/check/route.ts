export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { granolaIntakeEnabled } from "@/lib/granola";
import { runGranolaSweep, safeErrorText } from "@/lib/granola-intake";

export async function POST() {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;
    if (!granolaIntakeEnabled()) {
      return NextResponse.json({ error: "Granola intake is not configured" }, { status: 409 });
    }

    let summary;
    try {
      summary = await runGranolaSweep("MANUAL");
    } catch (err) {
      console.error(`POST /api/admin/granola/check failed: ${safeErrorText(err)}`);
      return NextResponse.json({ error: safeErrorText(err) }, { status: 502 });
    }
    await logAdminAction(user!, "GRANOLA_CHECK_RUN", { metadata: { ...summary } });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("POST /api/admin/granola/check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
