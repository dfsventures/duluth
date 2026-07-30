import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";
import { ReportView } from "@/components/report-view";
import { extractMentionIds, buildMentionSnapshot, hasFundSnapshotMarker } from "@/lib/report-snapshot";
import { buildFundReportSnapshot, type FundSnapshotPayload } from "@/lib/portfolio-metrics";
import type { MentionCardData } from "@/components/mention-cards";

export default async function AdminReportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN")) {
    redirect("/login");
  }

  const { id } = await params;
  const report = await db.fundReport.findUnique({
    where: { id },
    include: { fund: { select: { id: true, name: true } } },
  });
  if (!report) notFound();

  // Draft previews compute LIVE snapshots — the next publish re-freezes
  // fresh numbers regardless of what this preview showed (Q13).
  const mentionedIds = extractMentionIds(report.body);
  const companies = await db.portfolioCompany.findMany({
    where: { id: { in: mentionedIds } },
    include: { deals: { where: { fundId: report.fundId } } },
  });

  const mentions: MentionCardData[] = companies
    .filter((c) => c.deals.length > 0)
    .map((c) => ({
      portfolioCompanyId: c.id,
      ...buildMentionSnapshot(
        c.name,
        c.country,
        c.deals.map((d) => ({
          investmentType: d.investmentType,
          dealDate: d.dealDate,
          amountUsd: Number(d.amountUsd),
          entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
          currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
        }))
      ),
    }));

  // Part 14, WS35.2 — fund-performance snapshot, live-computed here (never
  // frozen in preview — mirrors the mention live-compute above and Q13's
  // "next publish re-freezes fresh numbers regardless of what this preview
  // showed"). Always keyed off report.fundId, read straight from the report
  // row already loaded above — never a client-suppliable id.
  let fundSnapshot: FundSnapshotPayload | null = null;
  if (hasFundSnapshotMarker(report.body)) {
    const fund = await db.fund.findUnique({
      where: { id: report.fundId },
      include: { deals: { include: { portfolioCompany: { select: { name: true } } } }, cashflows: true },
    });
    if (fund) {
      fundSnapshot = buildFundReportSnapshot(
        fund.name,
        fund.deals.map((d) => ({
          companyName: d.portfolioCompany.name,
          investmentType: d.investmentType,
          dealDate: d.dealDate,
          amountUsd: Number(d.amountUsd),
          instrument: d.instrument,
          entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
          currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
          ownershipPct: d.ownershipPct !== null ? Number(d.ownershipPct) : null,
          valuationAsOf: d.valuationAsOf,
        })),
        fund.cashflows.map((c) => ({ kind: c.kind, date: c.date, amountUsd: Number(c.amountUsd) })),
        // Part 15, WS37.6 — manual performance override (Q46-Q52), already
        // present on `fund` since the findUnique above has no `select`.
        {
          grossMoic: fund.grossMoicOverride !== null ? Number(fund.grossMoicOverride) : null,
          netTvpi: fund.netTvpiOverride !== null ? Number(fund.netTvpiOverride) : null,
          netDpi: fund.netDpiOverride !== null ? Number(fund.netDpiOverride) : null,
        }
      );
    }
  }

  return (
    <AppShell>
      <ReportView
        title={report.title}
        periodLabel={report.periodLabel}
        publishedAt={report.publishedAt}
        fundName={report.fund.name}
        bodyHtml={report.body}
        mentions={mentions}
        fundSnapshot={fundSnapshot}
        previewBanner
      />
    </AppShell>
  );
}
