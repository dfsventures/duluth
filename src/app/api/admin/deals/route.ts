export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

const VALID_TYPES = ["INITIAL", "FOLLOW_ON"];

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { fundId, portfolioCompanyId, investmentType, dealDate } = body;

    if (!fundId || !(await db.fund.findUnique({ where: { id: fundId } }))) {
      return NextResponse.json({ error: "A valid fundId is required." }, { status: 400 });
    }
    if (!portfolioCompanyId || !(await db.portfolioCompany.findUnique({ where: { id: portfolioCompanyId } }))) {
      return NextResponse.json({ error: "A valid portfolioCompanyId is required." }, { status: 400 });
    }
    if (!VALID_TYPES.includes(investmentType)) {
      return NextResponse.json({ error: "investmentType must be INITIAL or FOLLOW_ON." }, { status: 400 });
    }
    const parsedDate = dealDate ? new Date(dealDate) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "A valid dealDate is required." }, { status: 400 });
    }
    const amountUsd = Number(body.amountUsd);
    if (!amountUsd || amountUsd <= 0) {
      return NextResponse.json({ error: "amountUsd must be greater than 0." }, { status: 400 });
    }
    const entryValuation = body.entryValuation !== undefined && body.entryValuation !== null && body.entryValuation !== "" ? Number(body.entryValuation) : null;
    const currentValuation = body.currentValuation !== undefined && body.currentValuation !== null && body.currentValuation !== "" ? Number(body.currentValuation) : null;
    if (entryValuation !== null && entryValuation < 0) {
      return NextResponse.json({ error: "entryValuation cannot be negative." }, { status: 400 });
    }
    if (currentValuation !== null && currentValuation < 0) {
      return NextResponse.json({ error: "currentValuation cannot be negative." }, { status: 400 });
    }

    const deal = await db.deal.create({
      data: {
        fundId,
        portfolioCompanyId,
        investmentType,
        dealDate: parsedDate,
        country: body.country?.trim() || null,
        amountUsd,
        instrument: body.instrument?.trim() || null,
        entryValuation,
        currentValuation,
        valuationAsOf: currentValuation !== null ? new Date() : null,
        notes: body.notes?.trim() || null,
      },
    });

    await logAdminAction(user!, "DEAL_CREATED", {
      targetType: "Deal",
      targetId: deal.id,
      metadata: { fundId, portfolioCompanyId, investmentType, amountUsd },
    });
    return NextResponse.json(
      {
        ...deal,
        amountUsd: Number(deal.amountUsd),
        entryValuation: deal.entryValuation !== null ? Number(deal.entryValuation) : null,
        currentValuation: deal.currentValuation !== null ? Number(deal.currentValuation) : null,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/admin/deals error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
