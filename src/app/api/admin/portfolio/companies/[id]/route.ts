export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { computeMultiple } from "@/lib/report-snapshot";

// WS25.1 — per-company cross-fund view: deals across every fund, the
// ledger (rounds/marks), and per-fund "positions" computed on the fly
// (JC18 — not a stored table).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const company = await db.portfolioCompany.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        deals: {
          include: { fund: { select: { id: true, name: true, slug: true } }, round: { select: { id: true, label: true, kind: true } } },
          orderBy: { dealDate: "asc" },
        },
        rounds: { orderBy: { roundDate: "asc" } },
        marks: { orderBy: { asOf: "desc" } },
      },
    });
    if (!company) return NextResponse.json({ error: "Portfolio company not found" }, { status: 404 });

    const latestMark = company.marks[0] ?? null;
    const latestValuation = latestMark ? Number(latestMark.valuationUsd) : null;

    // Group deals by fund for the "positions" block (JC18: computed, not persisted).
    const byFund = new Map<string, { fund: { id: string; name: string; slug: string }; invested: number; dealCount: number; latestMultiple: number | null }>();
    for (const d of company.deals) {
      const key = d.fund.id;
      const entry = byFund.get(key) ?? { fund: d.fund, invested: 0, dealCount: 0, latestMultiple: null };
      entry.invested += Number(d.amountUsd);
      entry.dealCount += 1;
      const entryVal = d.entryValuation !== null ? Number(d.entryValuation) : null;
      const currentVal = d.currentValuation !== null ? Number(d.currentValuation) : null;
      entry.latestMultiple = computeMultiple(entryVal, currentVal);
      byFund.set(key, entry);
    }

    return NextResponse.json({
      id: company.id,
      name: company.name,
      country: company.country,
      company: company.company,
      deals: company.deals.map((d) => ({
        id: d.id,
        fund: d.fund,
        investmentType: d.investmentType,
        dealDate: d.dealDate,
        amountUsd: Number(d.amountUsd),
        instrument: d.instrument,
        entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
        currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
        valuationAsOf: d.valuationAsOf,
        roundId: d.roundId,
        round: d.round,
        ownershipPct: d.ownershipPct !== null ? Number(d.ownershipPct) : null,
      })),
      rounds: company.rounds.map((r) => ({
        id: r.id,
        label: r.label,
        kind: r.kind,
        roundDate: r.roundDate,
        raisedUsd: r.raisedUsd !== null ? Number(r.raisedUsd) : null,
        preMoneyUsd: r.preMoneyUsd !== null ? Number(r.preMoneyUsd) : null,
        postMoneyUsd: r.postMoneyUsd !== null ? Number(r.postMoneyUsd) : null,
        source: r.source,
        notes: r.notes,
      })),
      marks: company.marks.map((m) => ({
        id: m.id,
        valuationUsd: Number(m.valuationUsd),
        asOf: m.asOf,
        source: m.source,
        notes: m.notes,
      })),
      latestValuation,
      positions: [...byFund.values()],
    });
  } catch (err) {
    console.error("GET /api/admin/portfolio/companies/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
