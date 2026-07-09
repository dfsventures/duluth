import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLp } from "@/lib/lp-auth";
import { db } from "@/lib/db";
import { ReportView } from "@/components/report-view";
import type { MentionCardData } from "@/components/mention-cards";
import type { MentionSnapshot } from "@/lib/report-snapshot";

export const dynamic = "force-dynamic";

export default async function LpReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getLp();
  if (!ctx) redirect("/lp");

  const report = await db.fundReport.findUnique({
    where: { id },
    include: {
      fund: { select: { id: true, name: true } },
      mentions: { select: { portfolioCompanyId: true, snapshot: true } },
    },
  });

  // Membership failures are indistinguishable from nonexistence — same
  // pattern as the F16 token-scoped document proxy: a 404 here leaks
  // nothing about whether the report exists or which funds it belongs to.
  if (!report || report.status !== "PUBLISHED" || !ctx.fundIds.includes(report.fundId)) {
    notFound();
  }

  const mentions: MentionCardData[] = report.mentions.map((m) => ({
    portfolioCompanyId: m.portfolioCompanyId,
    ...(m.snapshot as unknown as MentionSnapshot),
  }));

  return (
    <div>
      <Link href="/lp" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-tide print:hidden">
        <ArrowLeft className="h-3.5 w-3.5" />
        All reports
      </Link>
      <ReportView
        title={report.title}
        periodLabel={report.periodLabel}
        publishedAt={report.publishedAt}
        fundName={report.fund.name}
        bodyHtml={report.body}
        mentions={mentions}
      />
    </div>
  );
}
