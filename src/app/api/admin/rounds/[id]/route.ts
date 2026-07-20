export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

const VALID_KINDS = ["PRICED", "SAFE", "CONVERSION", "OTHER", "UNKNOWN"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.financingRound.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Round not found" }, { status: 404 });

    const body = await request.json();
    const data: {
      label?: string | null;
      kind?: string;
      roundDate?: Date;
      raisedUsd?: number | null;
      preMoneyUsd?: number | null;
      postMoneyUsd?: number | null;
      notes?: string | null;
    } = {};

    if (body.label !== undefined) data.label = body.label?.trim() || null;
    if (body.kind !== undefined) {
      if (!VALID_KINDS.includes(body.kind)) {
        return NextResponse.json({ error: `kind must be one of ${VALID_KINDS.join(", ")}.` }, { status: 400 });
      }
      data.kind = body.kind;
    }
    if (body.roundDate !== undefined) {
      const d = new Date(body.roundDate);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid roundDate." }, { status: 400 });
      data.roundDate = d;
    }
    if (body.raisedUsd !== undefined) data.raisedUsd = body.raisedUsd === null || body.raisedUsd === "" ? null : Number(body.raisedUsd);
    if (body.preMoneyUsd !== undefined) data.preMoneyUsd = body.preMoneyUsd === null || body.preMoneyUsd === "" ? null : Number(body.preMoneyUsd);
    if (body.postMoneyUsd !== undefined) data.postMoneyUsd = body.postMoneyUsd === null || body.postMoneyUsd === "" ? null : Number(body.postMoneyUsd);
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    const round = await db.financingRound.update({ where: { id }, data });

    await logAdminAction(user!, "ROUND_UPDATED", { targetType: "FinancingRound", targetId: id, metadata: data as Record<string, unknown> });
    return NextResponse.json({
      ...round,
      raisedUsd: round.raisedUsd !== null ? Number(round.raisedUsd) : null,
      preMoneyUsd: round.preMoneyUsd !== null ? Number(round.preMoneyUsd) : null,
      postMoneyUsd: round.postMoneyUsd !== null ? Number(round.postMoneyUsd) : null,
    });
  } catch (err) {
    console.error("PATCH /api/admin/rounds/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.financingRound.findUnique({
      where: { id },
      include: { _count: { select: { deals: true, conversions: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Round not found" }, { status: 404 });

    if (existing._count.deals > 0 || existing._count.conversions > 0) {
      return NextResponse.json(
        { error: "This round still has deals attached (or is a recorded SAFE conversion target) — repoint them first." },
        { status: 409 }
      );
    }

    await db.financingRound.delete({ where: { id } });

    await logAdminAction(user!, "ROUND_DELETED", { targetType: "FinancingRound", targetId: id, metadata: { portfolioCompanyId: existing.portfolioCompanyId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/rounds/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
