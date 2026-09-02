export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Part 30, WS73 — broadcast CRUD, mirroring /api/admin/reports/** route
// for route. A DRAFT has no recipient rows by construction (they're only
// created at publish, WS69's freeze precedent) — its targetCount reports
// "N companies"; GET …/recipients is the honest source for reach.
export async function GET(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const broadcasts = await db.companyBroadcast.findMany({
      where: status ? { status } : {},
      include: { _count: { select: { targets: true, recipients: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      broadcasts.map((b) => ({
        id: b.id,
        subject: b.subject,
        status: b.status,
        publishedAt: b.publishedAt,
        createdAt: b.createdAt,
        targetCount: b._count.targets,
        recipientCount: b._count.recipients,
      }))
    );
  } catch (err) {
    console.error("GET /api/admin/broadcasts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const subject = body.subject?.trim();
    if (!subject || subject.length > 200) {
      return NextResponse.json({ error: "Subject is required and must be 200 characters or fewer." }, { status: 400 });
    }

    const portfolioCompanyIds: string[] = Array.isArray(body.portfolioCompanyIds) ? body.portfolioCompanyIds : [];

    const broadcast = await db.$transaction(async (tx) => {
      const created = await tx.companyBroadcast.create({
        data: { subject, body: "", status: "DRAFT", createdById: user!.id },
      });
      if (portfolioCompanyIds.length > 0) {
        await tx.companyBroadcastTarget.createMany({
          data: portfolioCompanyIds.map((portfolioCompanyId) => ({ broadcastId: created.id, portfolioCompanyId })),
        });
      }
      return created;
    });

    await logAdminAction(user!, "BROADCAST_CREATED", {
      targetType: "CompanyBroadcast",
      targetId: broadcast.id,
      metadata: { subject, companyCount: portfolioCompanyIds.length },
    });
    return NextResponse.json(broadcast, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/broadcasts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
