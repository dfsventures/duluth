export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

const VALID_KINDS = ["CAPITAL_CALL", "DISTRIBUTION", "FEE", "OTHER"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.fundCashflow.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Cashflow not found" }, { status: 404 });

    const body = await request.json();
    const data: { kind?: string; date?: Date; amountUsd?: number; portfolioCompanyId?: string | null; notes?: string | null } = {};

    if (body.kind !== undefined) {
      if (!VALID_KINDS.includes(body.kind)) {
        return NextResponse.json({ error: `kind must be one of ${VALID_KINDS.join(", ")}.` }, { status: 400 });
      }
      data.kind = body.kind;
    }
    if (body.date !== undefined) {
      const d = new Date(body.date);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date." }, { status: 400 });
      data.date = d;
    }
    if (body.amountUsd !== undefined) {
      const amt = Number(body.amountUsd);
      if (!amt || amt <= 0) return NextResponse.json({ error: "amountUsd must be greater than 0." }, { status: 400 });
      data.amountUsd = amt;
    }
    if (body.portfolioCompanyId !== undefined) data.portfolioCompanyId = body.portfolioCompanyId || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    const cashflow = await db.fundCashflow.update({ where: { id }, data });

    await logAdminAction(user!, "CASHFLOW_UPDATED", { targetType: "FundCashflow", targetId: id, metadata: data as Record<string, unknown> });
    return NextResponse.json({ ...cashflow, amountUsd: Number(cashflow.amountUsd) });
  } catch (err) {
    console.error("PATCH /api/admin/cashflows/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.fundCashflow.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Cashflow not found" }, { status: 404 });

    await db.fundCashflow.delete({ where: { id } });

    await logAdminAction(user!, "CASHFLOW_DELETED", { targetType: "FundCashflow", targetId: id, metadata: { fundId: existing.fundId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/cashflows/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
