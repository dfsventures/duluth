export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { senderLabels } from "@/lib/broadcast-sender";
import { logAdminAction } from "@/lib/audit";
import { updateBroadcastDraft } from "@/lib/broadcast-drafts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const broadcast = await db.companyBroadcast.findUnique({
      where: { id },
      include: {
        targets: { include: { portfolioCompany: { select: { id: true, name: true } } } },
        // Recipient rows only exist once PUBLISHED (frozen at publish, WS69).
        recipients: { select: { id: true, email: true, name: true, status: true, error: true, sentAt: true } },
      },
    });
    if (!broadcast) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

    const by = await senderLabels([broadcast]);
    return NextResponse.json({ ...broadcast, senderLabel: by[broadcast.id] ?? null });
  } catch (err) {
    console.error("GET /api/admin/broadcasts/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    // Part 39 (WS119): shared with the Marge tools; F121 makes the write conditional on DRAFT.
    const r = await updateBroadcastDraft(user!, id, {
      subject: body.subject,
      body: body.body,
      portfolioCompanyIds: body.portfolioCompanyIds,
    });
    return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    console.error("PATCH /api/admin/broadcasts/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.companyBroadcast.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

    if (existing.status === "PUBLISHED") {
      return NextResponse.json({ error: "A published broadcast can't be deleted." }, { status: 409 });
    }

    await db.companyBroadcast.delete({ where: { id } });

    await logAdminAction(user!, "BROADCAST_DELETED", {
      targetType: "CompanyBroadcast",
      targetId: id,
      metadata: { subject: existing.subject },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/broadcasts/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
