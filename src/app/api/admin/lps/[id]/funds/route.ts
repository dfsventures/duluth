export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const lp = await db.limitedPartner.findUnique({ where: { id } });
    if (!lp) return NextResponse.json({ error: "LP not found" }, { status: 404 });

    const body = await request.json();
    const fundId = body.fundId;
    const fund = fundId ? await db.fund.findUnique({ where: { id: fundId } }) : null;
    if (!fund) return NextResponse.json({ error: "A valid fundId is required." }, { status: 400 });

    const membership = await db.lpFundMembership.upsert({
      where: { lpId_fundId: { lpId: id, fundId } },
      update: {},
      create: { lpId: id, fundId },
    });

    await logAdminAction(user!, "LP_FUND_ASSIGNED", { targetType: "LimitedPartner", targetId: id, metadata: { fundId, fundSlug: fund.slug } });
    return NextResponse.json(membership, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/lps/[id]/funds error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const lp = await db.limitedPartner.findUnique({ where: { id } });
    if (!lp) return NextResponse.json({ error: "LP not found" }, { status: 404 });

    const body = await request.json();
    const fundId = body.fundId;
    if (!fundId) return NextResponse.json({ error: "fundId is required." }, { status: 400 });

    await db.lpFundMembership.deleteMany({ where: { lpId: id, fundId } });

    await logAdminAction(user!, "LP_FUND_UNASSIGNED", { targetType: "LimitedPartner", targetId: id, metadata: { fundId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/lps/[id]/funds error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
