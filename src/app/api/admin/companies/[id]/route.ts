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
      select: { portfolioCompany: { select: { id: true, name: true } } },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ portfolioCompany: company.portfolioCompany ?? null });
  } catch (err) {
    console.error("GET /api/admin/companies/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
