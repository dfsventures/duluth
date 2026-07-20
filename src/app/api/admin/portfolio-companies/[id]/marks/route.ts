export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// WS25.1 / JC16 — recording a mark also fans out currentValuation +
// valuationAsOf to every one of this company's deals, in one transaction.
// This is exactly what an admin's inline deal-valuation edit does today,
// so published report hover cards / snapshots stay byte-identical — the
// ledger gains history without changing the authoritative render path.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const company = await db.portfolioCompany.findUnique({ where: { id }, include: { deals: { select: { id: true, currentValuation: true } } } });
    if (!company) return NextResponse.json({ error: "Portfolio company not found" }, { status: 404 });

    const body = await request.json();
    if (body.valuationUsd === undefined || body.valuationUsd === null || body.valuationUsd === "") {
      return NextResponse.json({ error: "valuationUsd is required." }, { status: 400 });
    }
    const valuationUsd = Number(body.valuationUsd);
    if (Number.isNaN(valuationUsd) || valuationUsd < 0) {
      return NextResponse.json({ error: "valuationUsd must be a number >= 0 (0 = written off)." }, { status: 400 });
    }
    const asOf = body.asOf ? new Date(body.asOf) : new Date();
    if (Number.isNaN(asOf.getTime())) return NextResponse.json({ error: "Invalid asOf date." }, { status: 400 });

    const previousValuations = company.deals.map((d) => (d.currentValuation !== null ? Number(d.currentValuation) : null));

    const mark = await db.$transaction(async (tx) => {
      const created = await tx.valuationMark.create({
        data: { portfolioCompanyId: id, valuationUsd, asOf, source: "MANUAL", notes: body.notes?.trim() || null },
      });
      await tx.deal.updateMany({
        where: { portfolioCompanyId: id },
        data: { currentValuation: valuationUsd, valuationAsOf: asOf },
      });
      return created;
    });

    await logAdminAction(user!, "MARK_CREATED", {
      targetType: "ValuationMark",
      targetId: mark.id,
      metadata: { portfolioCompanyId: id, previousValuations, newValuation: valuationUsd, dealsUpdated: company.deals.length },
    });

    return NextResponse.json({
      ...mark,
      valuationUsd: Number(mark.valuationUsd),
    });
  } catch (err) {
    console.error("POST /api/admin/portfolio-companies/[id]/marks error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
