export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

// WS25.1 — cross-fund all-deals view (F25: the data layer was already
// unified; this is the first screen that actually shows it that way).
export async function GET(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const portfolioCompanyId = searchParams.get("portfolioCompanyId");
    const investmentType = searchParams.get("investmentType");
    const q = searchParams.get("q");

    const where = {
      ...(fundId ? { fundId } : {}),
      ...(portfolioCompanyId ? { portfolioCompanyId } : {}),
      ...(investmentType ? { investmentType } : {}),
      ...(q
        ? {
            OR: [
              { portfolioCompany: { name: { contains: q, mode: "insensitive" as const } } },
              { instrument: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const deals = await db.deal.findMany({
      where,
      include: {
        fund: { select: { id: true, name: true, slug: true } },
        portfolioCompany: { select: { id: true, name: true, country: true } },
        round: { select: { id: true, label: true, kind: true } },
      },
      orderBy: { dealDate: "desc" },
    });

    const totalInvested = deals.reduce((sum, d) => sum + Number(d.amountUsd), 0);
    const companyIds = new Set(deals.map((d) => d.portfolioCompanyId));
    const fundIds = new Set(deals.map((d) => d.fundId));

    return NextResponse.json({
      summary: {
        totalInvested,
        dealCount: deals.length,
        companyCount: companyIds.size,
        fundCount: fundIds.size,
      },
      deals: deals.map((d) => ({
        id: d.id,
        fund: d.fund,
        portfolioCompany: d.portfolioCompany,
        investmentType: d.investmentType,
        dealDate: d.dealDate,
        amountUsd: Number(d.amountUsd),
        instrument: d.instrument,
        entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
        currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
        valuationAsOf: d.valuationAsOf,
        round: d.round,
        ownershipPct: d.ownershipPct !== null ? Number(d.ownershipPct) : null,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/portfolio error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
