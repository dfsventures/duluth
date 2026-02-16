import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const companies = await db.company.findMany({
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
