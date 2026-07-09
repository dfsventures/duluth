export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

const VALID_TYPES = ["INITIAL", "FOLLOW_ON"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.deal.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const body = await request.json();
    const data: {
      investmentType?: string;
      dealDate?: Date;
      country?: string | null;
      amountUsd?: number;
      instrument?: string | null;
      entryValuation?: number | null;
      currentValuation?: number | null;
      valuationAsOf?: Date;
      notes?: string | null;
    } = {};

    if (body.investmentType !== undefined) {
      if (!VALID_TYPES.includes(body.investmentType)) {
        return NextResponse.json({ error: "investmentType must be INITIAL or FOLLOW_ON." }, { status: 400 });
      }
      data.investmentType = body.investmentType;
    }
    if (body.dealDate !== undefined) {
      const d = new Date(body.dealDate);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid dealDate." }, { status: 400 });
      data.dealDate = d;
    }
    if (body.country !== undefined) data.country = body.country?.trim() || null;
    if (body.amountUsd !== undefined) {
      const amt = Number(body.amountUsd);
      if (!amt || amt <= 0) return NextResponse.json({ error: "amountUsd must be greater than 0." }, { status: 400 });
      data.amountUsd = amt;
    }
    if (body.instrument !== undefined) data.instrument = body.instrument?.trim() || null;
    if (body.entryValuation !== undefined) {
      data.entryValuation = body.entryValuation === null || body.entryValuation === "" ? null : Number(body.entryValuation);
    }
    // Setting currentValuation also updates valuationAsOf — this is the
    // ongoing valuation-maintenance path now that Molly is the source of truth.
    if (body.currentValuation !== undefined) {
      data.currentValuation = body.currentValuation === null || body.currentValuation === "" ? null : Number(body.currentValuation);
      data.valuationAsOf = new Date();
    }
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    const deal = await db.deal.update({ where: { id }, data });

    await logAdminAction(user!, "DEAL_UPDATED", {
      targetType: "Deal",
      targetId: id,
      metadata: {
        previousValuation: existing.currentValuation !== null ? Number(existing.currentValuation) : null,
        newValuation: deal.currentValuation !== null ? Number(deal.currentValuation) : null,
      },
    });
    return NextResponse.json({
      ...deal,
      amountUsd: Number(deal.amountUsd),
      entryValuation: deal.entryValuation !== null ? Number(deal.entryValuation) : null,
      currentValuation: deal.currentValuation !== null ? Number(deal.currentValuation) : null,
    });
  } catch (err) {
    console.error("PATCH /api/admin/deals/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.deal.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    await db.deal.delete({ where: { id } });

    await logAdminAction(user!, "DEAL_DELETED", { targetType: "Deal", targetId: id, metadata: { fundId: existing.fundId, portfolioCompanyId: existing.portfolioCompanyId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/deals/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
