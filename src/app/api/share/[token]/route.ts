export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { buildMetricDateFilter, buildMetricSummary, endOfDayUTC } from "@/lib/share-metrics";

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
        selectedUpdates: { select: { updateId: true } },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Check expiry
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    const companyIds = link.companies.map((c) => c.companyId);
    const updateSelect = {
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
    } as const;

    let updates: Prisma.UpdateGetPayload<{ select: typeof updateSelect }>[];
    if (link.selectedUpdates.length > 0) {
      // New-style link: fetch the explicitly selected updates
      updates = await db.update.findMany({
        where: { id: { in: link.selectedUpdates.map((u) => u.updateId) } },
        select: updateSelect,
        orderBy: { sentAt: "desc" },
      });
    } else if (link.periodStart && link.periodEnd) {
      // Legacy link: filter by company + period range
      const periodEndInclusive = endOfDayUTC(link.periodEnd);
      updates = await db.update.findMany({
        where: {
          companyId: { in: companyIds },
          status: "SENT",
          sentAt: { gte: link.periodStart, lte: periodEndInclusive },
        },
        select: updateSelect,
        orderBy: { sentAt: "desc" },
      });
    } else {
      // Legacy link with no period range and no explicit selection — nothing to show
      updates = [];
    }

    // Metric summary: latest value per metric across the relevant companies.
    // Scoping rules live in src/lib/share-metrics.ts (pure, unit-tested).
    const metricDateFilter = buildMetricDateFilter({
      metricScope: link.metricScope,
      periodStart: link.periodStart,
      periodEnd: link.periodEnd,
      hasSelectedUpdates: link.selectedUpdates.length > 0,
    });

    const metricValues = await db.metricValue.findMany({
      where: {
        metricDefinition: { companyId: { in: companyIds } },
        ...metricDateFilter,
      },
      select: {
        id: true,
        value: true,
        date: true,
        metricDefinition: { select: { name: true, unit: true, companyId: true } },
      },
      orderBy: { date: "desc" },
    });

    // Per-company metric summary (latest value per metric in range) —
    // logic in src/lib/share-metrics.ts
    const metricsByCompany = buildMetricSummary(metricValues);

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
