export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

// Read-only counts for the sidebar markers (UI overhaul phase 4). Each count
// uses the same where-clause as the page it points at, so the number on the
// sidebar equals the number you land on.
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const [approvals, diligence, boardReview] = await Promise.all([
      // /api/admin/approvals: signups waiting for a decision.
      db.user.count({ where: { status: "PENDING", approvalToken: null } }),
      // /api/admin/diligence: companies whose checklist is complete and
      // not yet promoted ("Ready for review").
      db.company.count({
        where: { stage: "DILIGENCE", diligence: { is: { completedAt: { not: null }, closedAt: null } } },
      }),
      // /api/admin/board: cards flagged Needs review.
      db.boardCard.count({ where: { needsReview: true, archivedAt: null } }),
    ]);

    return NextResponse.json({ approvals, diligence, boardReview });
  } catch (err) {
    console.error("GET /api/admin/nav-counts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
