export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { approvedCompanyFilter } from "@/lib/company-filters";

export async function GET(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    // Part 31, WS76.3 (JC-LK-F) — opt-in only. approvedCompanyFilter hides
    // pending-signup and diligence companies from this endpoint's default
    // response on purpose (two shipped surfaces depend on that). A link
    // picker needs to see exactly the companies the default hides — a
    // brand-new signup is the most common thing an admin needs to link —
    // so `?linkable=1` bypasses the filter and returns a minimal shape.
    // The default (no param) response is byte-identical to before.
    const { searchParams } = new URL(request.url);
    if (searchParams.get("linkable") === "1") {
      const companies = await db.company.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, createdAt: true, portfolioCompany: { select: { id: true } } },
      });
      return NextResponse.json(
        companies.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt,
          portfolioCompanyId: c.portfolioCompany?.id ?? null,
        }))
      );
    }

    const companies = await db.company.findMany({
      where: approvedCompanyFilter,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            memberships: true,
            updates: true,
          },
        },
        updates: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const result = companies.map((c) => ({
      id: c.id,
      name: c.name,
      logo: c.logo,
      description: c.description,
      website: c.website,
      sector: c.sector,
      geography: c.geography,
      fundingStage: c.fundingStage,
      createdById: c.createdById,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      memberCount: c._count.memberships,
      updateCount: c._count.updates,
      lastUpdateDate: c.updates[0]?.createdAt || null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/admin/companies error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
