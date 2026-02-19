export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const link = await db.shareableLink.findUnique({
      where: { token },
      include: {
        companies: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                description: true,
                sector: true,
                geography: true,
                fundingStage: true,
                website: true,
              },
            },
          },
        },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Check expiry
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    // Fetch updates and metrics for each company within the period
    const companyIds = link.companies.map((c) => c.companyId);

    const [updates, metricValues] = await Promise.all([
      db.update.findMany({
        where: {
          companyId: { in: companyIds },
          status: "SENT",
          sentAt: {
            gte: link.periodStart,
            lte: link.periodEnd,
          },
        },
        select: {
          id: true,
          companyId: true,
          title: true,
          period: true,
          body: true,
          sentAt: true,
          createdAt: true,
          company: { select: { id: true, name: true } },
          metricValues: {
            select: {
              id: true,
              value: true,
              date: true,
              metricDefinition: { select: { name: true, unit: true } },
            },
          },
        },
        orderBy: { sentAt: "desc" },
      }),
      db.metricValue.findMany({
        where: {
          metricDefinition: { companyId: { in: companyIds } },
          date: {
            gte: link.periodStart,
            lte: link.periodEnd,
          },
        },
        select: {
          id: true,
          value: true,
          date: true,
          metricDefinition: {
            select: {
              name: true,
              unit: true,
              companyId: true,
            },
          },
        },
        orderBy: { date: "desc" },
      }),
    ]);

    // Build per-company metric summary (latest value per metric in range)
    const metricsByCompany: Record<string, { name: string; unit: string | null; value: number; date: string }[]> = {};
    const seen = new Set<string>();
    for (const mv of metricValues) {
      const key = `${mv.metricDefinition.companyId}:${mv.metricDefinition.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        const cid = mv.metricDefinition.companyId;
        if (!metricsByCompany[cid]) metricsByCompany[cid] = [];
        metricsByCompany[cid].push({
          name: mv.metricDefinition.name,
          unit: mv.metricDefinition.unit,
          value: Number(mv.value),
          date: mv.date.toISOString(),
        });
      }
    }

    return NextResponse.json({
      id: link.id,
      label: link.label,
      periodStart: link.periodStart,
      periodEnd: link.periodEnd,
      expiresAt: link.expiresAt,
      companies: link.companies.map((c) => ({
        ...c.company,
        metrics: metricsByCompany[c.companyId] ?? [],
      })),
      updates,
    });
  } catch (err) {
    console.error("GET /api/share/[token] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
