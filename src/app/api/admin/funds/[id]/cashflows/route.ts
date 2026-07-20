export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

const VALID_KINDS = ["CAPITAL_CALL", "DISTRIBUTION", "FEE", "OTHER"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: fundId } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const fund = await db.fund.findUnique({ where: { id: fundId } });
    if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 });

    const body = await request.json();
    if (!VALID_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: `kind must be one of ${VALID_KINDS.join(", ")}.` }, { status: 400 });
    }
    if (!body.date) return NextResponse.json({ error: "date is required." }, { status: 400 });
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

    const amountUsd = Number(body.amountUsd);
    if (!amountUsd || amountUsd <= 0) {
      return NextResponse.json({ error: "amountUsd must be greater than 0 (direction is implied by kind)." }, { status: 400 });
    }

    let portfolioCompanyId: string | null = body.portfolioCompanyId?.trim() || null;
    if (portfolioCompanyId) {
      const company = await db.portfolioCompany.findUnique({ where: { id: portfolioCompanyId } });
      if (!company) return NextResponse.json({ error: "Portfolio company not found" }, { status: 404 });
    }

    const cashflow = await db.fundCashflow.create({
      data: { fundId, portfolioCompanyId, kind: body.kind, date, amountUsd, notes: body.notes?.trim() || null },
    });

    await logAdminAction(user!, "CASHFLOW_CREATED", { targetType: "FundCashflow", targetId: cashflow.id, metadata: { fundId, kind: cashflow.kind, amountUsd } });
    return NextResponse.json({ ...cashflow, amountUsd: Number(cashflow.amountUsd) });
  } catch (err) {
    console.error("POST /api/admin/funds/[id]/cashflows error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
