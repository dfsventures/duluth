export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Removes history only — deliberate (WS25.1): the current valuation is
// corrected by writing a NEW mark, never by deleting an old one, so
// deleting a mark never touches Deal.currentValuation/valuationAsOf.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.valuationMark.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Mark not found" }, { status: 404 });

    await db.valuationMark.delete({ where: { id } });

    await logAdminAction(user!, "MARK_DELETED", { targetType: "ValuationMark", targetId: id, metadata: { portfolioCompanyId: existing.portfolioCompanyId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/marks/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
