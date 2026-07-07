import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { evaluateCompanyAlerts, DEFAULT_CHANGE_PCT, type CompanySnapshot } from "@/lib/metric-alerts";

// Vercel Cron invokes scheduled jobs with GET; POST is kept for manual
// testing with the CRON_SECRET. Both share the same handler (matches
// api/cron/reminders/route.ts).
async function handleAlerts(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same "skip unapproved-founder companies" filter as api/admin/dashboard/route.ts
  const approvedCompanyFilter = {
    NOT: { createdBy: { status: "PENDING", approvalToken: null } },
  } as const;

  const companies = await db.company.findMany({
    where: approvedCompanyFilter,
    include: {
      metricDefinitions: {
        include: {
          values: { orderBy: { date: "desc" }, take: 5 },
        },
      },
      updates: {
        where: { status: "SENT" },
        orderBy: { sentAt: "desc" },
        take: 3,
        select: { id: true, _count: { select: { metricValues: true } } },
      },
    },
  });

  const changePct = Number(process.env.METRIC_ALERT_CHANGE_PCT) || DEFAULT_CHANGE_PCT;

  const fired = companies.flatMap((company) => {
    const snapshot: CompanySnapshot = {
      companyId: company.id,
      companyName: company.name,
      metricDefinitionCount: company.metricDefinitions.length,
      series: company.metricDefinitions.map((def) => ({
        metricDefinitionId: def.id,
        name: def.name,
        unit: def.unit,
        values: def.values.map((v) => ({ value: Number(v.value), date: v.date })),
      })),
      lastPublishedUpdates: company.updates.map((u) => ({
        id: u.id,
        metricValueCount: u._count.metricValues,
      })),
    };
    return evaluateCompanyAlerts(snapshot, changePct);
  });

  let createdCount = 0;
  if (fired.length > 0) {
    const result = await db.metricAlert.createMany({
      data: fired.map((alert) => ({
        companyId: alert.companyId,
        rule: alert.rule,
        metricDefinitionId: alert.metricDefinitionId ?? null,
        message: alert.message,
        dedupeKey: alert.dedupeKey,
        metadata: alert.metadata as any,
      })),
      skipDuplicates: true,
    });
    createdCount = result.count;
  }

  console.log(`[cron/alerts] evaluated=${companies.length} fired=${createdCount}`);
  return Response.json({ evaluated: companies.length, fired: createdCount });
}

export async function GET(req: NextRequest) {
  return handleAlerts(req);
}

export async function POST(req: NextRequest) {
  return handleAlerts(req);
}
