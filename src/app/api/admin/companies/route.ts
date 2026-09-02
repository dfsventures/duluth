export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { approvedCompanyFilter } from "@/lib/company-filters";
import { CADENCE_LOOKBACK } from "@/lib/update-cadence";

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
    // ownerEmail/ownerName (WS78.1) are the createdBy founder's identity —
    // what D3's "also add as contact" checkbox writes to the portfolio
    // company's contact list once a company is picked to link.
    const { searchParams } = new URL(request.url);
    if (searchParams.get("linkable") === "1") {
      const companies = await db.company.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          createdAt: true,
          portfolioCompany: { select: { id: true } },
          createdBy: { select: { email: true, name: true } },
        },
      });
      return NextResponse.json(
        companies.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt,
          portfolioCompanyId: c.portfolioCompany?.id ?? null,
          ownerEmail: c.createdBy.email,
          ownerName: c.createdBy.name,
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

    // Part 32, WS85 (D1) — additive: the shared cadenceStatus() lib needs a
    // company's createdAt (already returned below) plus its recent
    // *published* update dates, which is a differently-filtered slice of
    // the same "updates" relation than the lastUpdateDate query above
    // (any status, most recent 1). Prisma can't include the same relation
    // twice with different filters in one query, so this is a second query
    // rather than a second `include` key. lastUpdateDate's existing
    // semantics (most recent update of any status) are untouched.
    const companyIds = companies.map((c) => c.id);
    const recentPublished = await db.update.findMany({
      where: { companyId: { in: companyIds }, status: "SENT" },
      orderBy: { sentAt: "desc" },
      select: { companyId: true, sentAt: true },
    });
    const publishedByCompany = new Map<string, { sentAt: Date | null }[]>();
    for (const u of recentPublished) {
      const arr = publishedByCompany.get(u.companyId) ?? [];
      if (arr.length < CADENCE_LOOKBACK) arr.push({ sentAt: u.sentAt });
      publishedByCompany.set(u.companyId, arr);
    }

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
      // Additive (Part 32, D1) — feeds cadenceStatus() on the companies list
      // page; not used anywhere else, and no existing field changed shape.
      recentPublishedUpdates: publishedByCompany.get(c.id) ?? [],
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
