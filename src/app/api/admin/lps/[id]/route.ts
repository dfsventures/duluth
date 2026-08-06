export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.limitedPartner.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "LP not found" }, { status: 404 });

    const body = await request.json();

    // Part 26/WS60: email is now managed exclusively via
    // /api/admin/lps/[id]/emails — this route is name-only. It no longer
    // accepts (or revokes sessions for) an email change; the D3
    // "revoke-only-at-zero-addresses" rule lives in the sub-route.
    const data: { name?: string | null } = {};
    if (body.name !== undefined) data.name = body.name?.trim() || null;

    const lp = await db.limitedPartner.update({ where: { id }, data });

    await logAdminAction(user!, "LP_UPDATED", {
      targetType: "LimitedPartner",
      targetId: id,
      metadata: { name: lp.name },
    });
    return NextResponse.json(lp);
  } catch (err) {
    console.error("PATCH /api/admin/lps/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.limitedPartner.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "LP not found" }, { status: 404 });

    // Cascades remove memberships/sessions/OTPs (schema onDelete: Cascade)
    await db.limitedPartner.delete({ where: { id } });

    await logAdminAction(user!, "LP_DELETED", { targetType: "LimitedPartner", targetId: id, metadata: { email: existing.email } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/lps/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
