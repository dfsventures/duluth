export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    // Get the start of the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run queries in parallel for performance
    const [
      totalCompanies,
      pendingApprovals,
      updatesThisMonth,
      companies,
    ] = await Promise.all([
      db.company.count(),
      db.user.count({ where: { status: "PENDING" } }),
      db.update.count({
        where: {
          createdAt: { gte: startOfMonth },
        },
      }),
      db.company.findMany({
        orderBy: { name: "asc" },
        include: {
          updates: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
    ]);

    // Calculate overdue companies and format the response
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let companiesOverdue = 0;

    const companiesData = companies.map((c) => {
      const lastUpdateDate = c.updates[0]?.createdAt || null;
      const daysSinceUpdate = lastUpdateDate
        ? Math.floor(
            (Date.now() - new Date(lastUpdateDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

      if (!lastUpdateDate || new Date(lastUpdateDate) < thirtyDaysAgo) {
        companiesOverdue++;
      }

      return {
        id: c.id,
        name: c.name,
        sector: c.sector,
        geography: c.geography,
        lastUpdateDate,
        daysSinceUpdate,
      };
    });

    return NextResponse.json({
      totalCompanies,
      pendingApprovals,
      updatesThisMonth,
      companiesOverdue,
      companies: companiesData,
    });
  } catch (err) {
    console.error("GET /api/admin/dashboard error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
