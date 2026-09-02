export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

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

    return NextResponse.json(broadcast);
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

    const existing = await db.companyBroadcast.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

    // JC-BC-D: no unpublish route exists — a published broadcast can't be
    // edited, only duplicated as a new draft.
    if (existing.status === "PUBLISHED") {
      return NextResponse.json(
        { error: "Published broadcasts can't be edited. Duplicate it as a draft instead." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const data: { subject?: string; body?: string } = {};

    if (body.subject !== undefined) {
      const subject = body.subject?.trim();
      if (!subject || subject.length > 200) {
        return NextResponse.json({ error: "Subject is required and must be 200 characters or fewer." }, { status: 400 });
      }
      data.subject = subject;
    }
    if (body.body !== undefined) data.body = body.body;

    let portfolioCompanyIds: string[] | undefined;
    if (body.portfolioCompanyIds !== undefined) {
      if (!Array.isArray(body.portfolioCompanyIds)) {
        return NextResponse.json({ error: "portfolioCompanyIds must be an array." }, { status: 400 });
      }
      portfolioCompanyIds = body.portfolioCompanyIds;
      const found = await db.portfolioCompany.findMany({
        where: { id: { in: portfolioCompanyIds } },
        select: { id: true },
      });
      if (found.length !== new Set(portfolioCompanyIds).size) {
        return NextResponse.json({ error: "One or more selected companies could not be found." }, { status: 400 });
      }
    }

    const broadcast = await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.companyBroadcast.update({ where: { id }, data });
      }
      if (portfolioCompanyIds !== undefined) {
        await tx.companyBroadcastTarget.deleteMany({ where: { broadcastId: id } });
        if (portfolioCompanyIds.length > 0) {
          await tx.companyBroadcastTarget.createMany({
            data: portfolioCompanyIds.map((portfolioCompanyId) => ({ broadcastId: id, portfolioCompanyId })),
          });
        }
      }
      return tx.companyBroadcast.findUnique({ where: { id } });
    });

    await logAdminAction(user!, "BROADCAST_UPDATED", { targetType: "CompanyBroadcast", targetId: id });
    return NextResponse.json(broadcast);
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
