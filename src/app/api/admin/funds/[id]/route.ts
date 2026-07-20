export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { fundFlows, xirr, computePaidIn, tvpi, dpi, positionValue } from "@/lib/portfolio-metrics";

// GET is not in the original WS16 route list but is required by the admin
// fund-detail page (deals/LPs/reports tabs) — additive, same guard pattern.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const fund = await db.fund.findUnique({
      where: { id },
      include: {
        deals: {
          include: { portfolioCompany: { select: { id: true, name: true } } },
          orderBy: { dealDate: "desc" },
        },
        lps: { include: { lp: { select: { id: true, email: true, name: true } } } },
        reports: { orderBy: { createdAt: "desc" } },
        cashflows: {
          include: { portfolioCompany: { select: { id: true, name: true } } },
          orderBy: { date: "desc" },
        },
      },
    });
    if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 });

    // WS26.2 — derived metrics, admin-only (Q23). Each deal's position value
    // uses deal.currentValuation as the "latest mark" (JC16: it's already
    // fanned out from ValuationMark, so no extra query is needed here).
    const invested = fund.deals.reduce((s, d) => s + Number(d.amountUsd), 0);
    let impliedValue = 0;
    let anyDilutionAware = false;
    for (const d of fund.deals) {
      const pv = positionValue(
        {
          amountUsd: Number(d.amountUsd),
          entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
          currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
          ownershipPct: d.ownershipPct !== null ? Number(d.ownershipPct) : null,
        },
        d.currentValuation !== null ? Number(d.currentValuation) : null
      );
      if (pv.value !== null) impliedValue += pv.value;
      if (pv.dilutionAware) anyDilutionAware = true;
    }
    const distributions = fund.cashflows.filter((c) => c.kind === "DISTRIBUTION").reduce((s, c) => s + Number(c.amountUsd), 0);
    const capitalCallAmounts = fund.cashflows.filter((c) => c.kind === "CAPITAL_CALL").map((c) => Number(c.amountUsd));
    const { paidIn, approximate } = computePaidIn(invested, capitalCallAmounts);
    const latestValuationAsOf = fund.deals.reduce<Date | null>((latest, d) => {
      if (!d.valuationAsOf) return latest;
      return !latest || d.valuationAsOf > latest ? d.valuationAsOf : latest;
    }, null);
    const asOf = latestValuationAsOf ?? new Date();
    const grossIrr = xirr(
      fundFlows(
        fund.deals.map((d) => ({ dealDate: d.dealDate, amountUsd: Number(d.amountUsd) })),
        fund.cashflows.map((c) => ({ kind: c.kind, date: c.date, amountUsd: Number(c.amountUsd) })),
        impliedValue,
        asOf
      )
    );

    const performance = {
      invested,
      impliedValue,
      dilutionAware: anyDilutionAware,
      paidIn,
      approximate, // TVPI/DPI carry this — true unless the fund has real CAPITAL_CALL rows
      tvpi: tvpi(paidIn, distributions, impliedValue),
      dpi: dpi(paidIn, distributions),
      grossIrr,
      asOf,
    };

    return NextResponse.json({
      id: fund.id,
      slug: fund.slug,
      name: fund.name,
      groupLabel: fund.groupLabel,
      firstDealDate: fund.firstDealDate,
      aumUsd: fund.aumUsd !== null ? Number(fund.aumUsd) : null,
      sortOrder: fund.sortOrder,
      createdAt: fund.createdAt,
      updatedAt: fund.updatedAt,
      deals: fund.deals.map((d) => ({
        id: d.id,
        portfolioCompanyId: d.portfolioCompanyId,
        portfolioCompanyName: d.portfolioCompany.name,
        investmentType: d.investmentType,
        dealDate: d.dealDate,
        country: d.country,
        amountUsd: Number(d.amountUsd),
        instrument: d.instrument,
        entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
        currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
        valuationAsOf: d.valuationAsOf,
        notes: d.notes,
      })),
      lps: fund.lps.map((m) => ({ id: m.id, lp: m.lp })),
      reports: fund.reports.map((r) => ({
        id: r.id,
        title: r.title,
        periodLabel: r.periodLabel,
        status: r.status,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
      })),
      cashflows: fund.cashflows.map((c) => ({
        id: c.id,
        kind: c.kind,
        date: c.date,
        amountUsd: Number(c.amountUsd),
        portfolioCompanyId: c.portfolioCompanyId,
        portfolioCompanyName: c.portfolioCompany?.name ?? null,
        notes: c.notes,
      })),
      performance,
    });
  } catch (err) {
    console.error("GET /api/admin/funds/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.fund.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Fund not found" }, { status: 404 });

    const body = await request.json();
    const data: {
      name?: string;
      groupLabel?: string | null;
      firstDealDate?: Date | null;
      aumUsd?: number | null;
      sortOrder?: number;
    } = {};

    if (body.name !== undefined) {
      const name = body.name?.trim();
      if (!name || name.length > 120) {
        return NextResponse.json({ error: "Name is required and must be 120 characters or fewer." }, { status: 400 });
      }
      data.name = name;
    }
    if (body.groupLabel !== undefined) data.groupLabel = body.groupLabel?.trim() || null;
    if (body.firstDealDate !== undefined) data.firstDealDate = body.firstDealDate ? new Date(body.firstDealDate) : null;
    if (body.aumUsd !== undefined) data.aumUsd = body.aumUsd === null || body.aumUsd === "" ? null : Number(body.aumUsd);
    if (body.sortOrder !== undefined && typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
    // slug is immutable — the import key, and never shown to LPs

    const fund = await db.fund.update({ where: { id }, data });

    await logAdminAction(user!, "FUND_UPDATED", { targetType: "Fund", targetId: id, metadata: data as Record<string, unknown> });
    return NextResponse.json({ ...fund, aumUsd: fund.aumUsd !== null ? Number(fund.aumUsd) : null });
  } catch (err) {
    console.error("PATCH /api/admin/funds/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.fund.findUnique({
      where: { id },
      include: { _count: { select: { deals: true, lps: true, reports: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Fund not found" }, { status: 404 });

    if (existing._count.deals > 0 || existing._count.lps > 0 || existing._count.reports > 0) {
      return NextResponse.json(
        { error: "This fund still has deals, LPs, or reports attached — remove those first." },
        { status: 409 }
      );
    }

    await db.fund.delete({ where: { id } });

    await logAdminAction(user!, "FUND_DELETED", { targetType: "Fund", targetId: id, metadata: { slug: existing.slug } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/funds/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
