export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Part 30, WS73 / D8 — duplicate-as-draft. Copies subject (prefixed "Copy
// of "), body, and target rows into a new DRAFT; never copies recipient
// rows (those are a frozen delivery record, not audience state to carry
// forward).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.companyBroadcast.findUnique({
      where: { id },
      include: { targets: true },
    });
    if (!existing) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

    const duplicate = await db.$transaction(async (tx) => {
      const created = await tx.companyBroadcast.create({
        data: {
          subject: `Copy of ${existing.subject}`,
          body: existing.body,
          status: "DRAFT",
          createdById: user!.id,
        },
      });
      if (existing.targets.length > 0) {
        await tx.companyBroadcastTarget.createMany({
          data: existing.targets.map((t) => ({ broadcastId: created.id, portfolioCompanyId: t.portfolioCompanyId })),
        });
      }
      return created;
    });

    await logAdminAction(user!, "BROADCAST_CREATED", {
      targetType: "CompanyBroadcast",
      targetId: duplicate.id,
      metadata: { duplicatedFrom: id },
    });
    return NextResponse.json(duplicate, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/broadcasts/[id]/duplicate error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
