import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";
import { ReportView } from "@/components/report-view";
import { extractMentionIds, buildMentionSnapshot } from "@/lib/report-snapshot";
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

  return (
    <AppShell>
      <ReportView
        title={report.title}
        periodLabel={report.periodLabel}
        publishedAt={report.publishedAt}
        fundName={report.fund.name}
        bodyHtml={report.body}
        mentions={mentions}
        previewBanner
      />
    </AppShell>
  );
}
