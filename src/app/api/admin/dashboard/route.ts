export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { approvedCompanyFilter } from "@/lib/company-filters";

const GRACE_PERIOD_DAYS = 30;
const MIN_UPDATES_FOR_CADENCE = 3;
const CADENCE_LOOKBACK = 5;

function isCompanyOverdue(company: {
  createdAt: Date;
  publishedUpdates: { sentAt: Date | null }[];
}): boolean {
  const now = Date.now();
  const ageMs = now - company.createdAt.getTime();
  const ageInDays = ageMs / (1000 * 60 * 60 * 24);

  // Rule 1: grace period — never flag a new company
  if (ageInDays < GRACE_PERIOD_DAYS) return false;

  const dates = company.publishedUpdates
    .map((u) => u.sentAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime()); // most recent first

  // Rule 2: past grace period but fewer than 3 published updates → flag
  if (dates.length < MIN_UPDATES_FOR_CADENCE) return true;

  // Rule 3: calculate cadence from last 5 published updates
  const recent = dates.slice(0, CADENCE_LOOKBACK);
  let totalGapMs = 0;
  for (let i = 0; i < recent.length - 1; i++) {
    totalGapMs += recent[i].getTime() - recent[i + 1].getTime();
  }
  const avgGapMs = totalGapMs / (recent.length - 1);
  const timeSinceLastMs = now - recent[0].getTime();

  return timeSinceLastMs > avgGapMs;
}

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Build last-6-months date boundaries
    const sixMonthsData: { month: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const month = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      sixMonthsData.push({ month, start, end });
    }

    const [totalCompanies, pendingApprovals, updatesThisMonth, companies, allSentUpdates, companiesWithMetrics] =
      await Promise.all([
        db.company.count({ where: approvedCompanyFilter }),
        db.user.count({ where: { status: "PENDING", approvalToken: null } }),
        db.update.count({ where: { createdAt: { gte: startOfMonth } } }),
        db.company.findMany({
          where: approvedCompanyFilter,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            sector: true,
            geography: true,
            fundingStage: true,
            createdAt: true,
            lastReminderSentAt: true,
            updates: {
              where: { status: "SENT" },
              orderBy: { sentAt: "desc" },
              take: CADENCE_LOOKBACK,
              select: { sentAt: true },
            },
          },
        }),
        // For updates-per-month: fetch SENT updates from last 6 months
        db.update.findMany({
          where: {
            status: "SENT",
            sentAt: { gte: sixMonthsData[0].start },
          },
          select: { sentAt: true },
        }),
        // Companies with at least one metric definition
        db.metricDefinition.findMany({
          select: { companyId: true },
          distinct: ["companyId"],
        }),
      ]);

    // Build overdue list and sector breakdown
    let companiesOverdue = 0;
    const overdueList: { id: string; name: string; sector: string | null; daysSinceUpdate: number | null; lastReminderSentAt: string | null }[] = [];
    const sectorMap: Record<string, number> = {};

    const companiesData = companies.map((c) => {
      const publishedUpdates = c.updates.map((u) => ({ sentAt: u.sentAt }));
      const lastSentAt = publishedUpdates[0]?.sentAt ?? null;
      const daysSinceUpdate = lastSentAt
        ? Math.floor((Date.now() - new Date(lastSentAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const overdue = isCompanyOverdue({ createdAt: c.createdAt, publishedUpdates });
      if (overdue) {
        companiesOverdue++;
        overdueList.push({ id: c.id, name: c.name, sector: c.sector, daysSinceUpdate, lastReminderSentAt: c.lastReminderSentAt?.toISOString() ?? null });
      }

      const sector = c.sector ?? "Uncategorized";
      sectorMap[sector] = (sectorMap[sector] ?? 0) + 1;

      return { id: c.id, name: c.name, sector: c.sector, geography: c.geography, lastUpdateDate: lastSentAt, daysSinceUpdate };
    });

    // Updates per month (last 6 months)
    const updatesByMonth = sixMonthsData.map(({ month, start, end }) => ({
      month,
      count: allSentUpdates.filter((u) => {
        const d = u.sentAt ? new Date(u.sentAt) : null;
        return d && d >= start && d < end;
      }).length,
    }));

    // Sector breakdown (sorted by count desc)
    const sectorBreakdown = Object.entries(sectorMap)
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count);

    const companiesWithMetricsSet = new Set(companiesWithMetrics.map((m) => m.companyId));
    const noMetricsCount = companies.filter((c) => !companiesWithMetricsSet.has(c.id)).length;

    return NextResponse.json({
      totalCompanies,
      pendingApprovals,
      updatesThisMonth,
      companiesOverdue,
      noMetricsCount,
      overdueCompanies: overdueList,
      updatesByMonth,
      sectorBreakdown,
      companies: companiesData,
    });
  } catch (err) {
    console.error("GET /api/admin/dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
