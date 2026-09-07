export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

// Part 31, WS79 — deliberately a NEW, admin-only route, not an addition
// to GET /api/companies/[id]. That existing route is founder-reachable
// (requireCompanyAccess, not requireAdmin — /company/profile calls it
// directly), and D5 forbids changing the shape of any founder-reachable
// API response anywhere in this Part. This route exists solely to feed
// the read-only "Portfolio: Acme →" line on /admin/companies/[id]
// without touching that shared endpoint at all.
//
// Part 34, WS91 (F80/F81) — the founder's DD questionnaire answers, for a
// company at ANY stage. There is deliberately NO stage filter here: the
// CompanyDiligence row outlives promotion (promote/route.ts:38-41 sets
// closedAt and nothing else), and GET /api/admin/diligence's
// `where: { stage: "DILIGENCE" }` is exactly what made these answers
// unreadable after a deal closed. Stays on this admin-only route, never on
// the founder-reachable GET /api/companies/[id] (Part 31, D5).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const company = await db.company.findUnique({
      where: { id },
      select: {
        stage: true,
        portfolioCompany: { select: { id: true, name: true } },
        diligence: {
          select: {
            isUsIncorporated: true,
            isStellarEcosystem: true,
            stellarWhyText: true,
            stellarTimelineText: true,
            completedAt: true,
            closedAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({
      portfolioCompany: company.portfolioCompany ?? null,
      stage: company.stage,
      diligence: company.diligence ?? null,
    });
  } catch (err) {
    console.error("GET /api/admin/companies/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
