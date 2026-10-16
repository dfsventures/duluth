export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { senderLabels } from "@/lib/broadcast-sender";
import { createBroadcastDraft } from "@/lib/broadcast-drafts";

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

    const by = await senderLabels(broadcasts);
    return NextResponse.json(
      broadcasts.map((b) => ({
        id: b.id,
        subject: b.subject,
        status: b.status,
        publishedAt: b.publishedAt,
        createdAt: b.createdAt,
        targetCount: b._count.targets,
        recipientCount: b._count.recipients,
        senderLabel: by[b.id] ?? null,
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
    // Part 39 (WS119): shared with the Marge tools; F122 validates company ids here too.
    const r = await createBroadcastDraft(user!, {
      subject: body.subject,
      portfolioCompanyIds: body.portfolioCompanyIds,
    });
    return r.ok ? NextResponse.json(r.value, { status: 201 }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    console.error("POST /api/admin/broadcasts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
