export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const report = await db.fundReport.findUnique({ where: { id } });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    if (report.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Only a published report can be unpublished." }, { status: 400 });
    }

    // Q13: publishedAt is kept for reference; mentions stay until the next
    // publish overwrites them — LP pages only ever read PUBLISHED reports,
    // so a stale draft's snapshots leak nothing.
    const updated = await db.fundReport.update({ where: { id }, data: { status: "DRAFT" } });

    await logAdminAction(user!, "REPORT_UNPUBLISHED", { targetType: "FundReport", targetId: id });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("POST /api/admin/reports/[id]/unpublish error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
