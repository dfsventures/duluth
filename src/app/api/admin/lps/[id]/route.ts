export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.limitedPartner.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "LP not found" }, { status: 404 });

    const body = await request.json();
    const data: { name?: string | null; email?: string } = {};

    if (body.name !== undefined) data.name = body.name?.trim() || null;

    let emailChanged = false;
    if (body.email !== undefined) {
      const email = body.email?.trim().toLowerCase();
      if (!email || !EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
      }
      if (email !== existing.email) {
        const clash = await db.limitedPartner.findUnique({ where: { email } });
        if (clash) return NextResponse.json({ error: "Another LP already uses this email." }, { status: 400 });
        data.email = email;
        emailChanged = true;
      }
    }

    // Email change revokes all active sessions in the same transaction (Q10)
    // — the old inbox must not retain access via a live cookie.
    const lp = await db.$transaction(async (tx) => {
      const updated = await tx.limitedPartner.update({ where: { id }, data });
      if (emailChanged) {
        await tx.lpSession.deleteMany({ where: { lpId: id } });
      }
      return updated;
    });

    await logAdminAction(user!, "LP_UPDATED", {
      targetType: "LimitedPartner",
      targetId: id,
      metadata: emailChanged ? { from: existing.email, to: lp.email, sessionsRevoked: true } : { name: lp.name },
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
