import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLp } from "@/lib/lp-auth";
import { db } from "@/lib/db";
import { ReportView } from "@/components/report-view";
import type { MentionCardData } from "@/components/mention-cards";
import type { MentionSnapshot } from "@/lib/report-snapshot";
import type { FundSnapshotPayload } from "@/lib/portfolio-metrics";

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
      // Part 14, WS35.3 — the frozen fund-performance snapshot, if this
      // report has one. This route only ever READS the already-frozen row
      // scoped to the report it already has access to; it never computes
      // anything live and never accepts a fund id of its own (ground rule
      // 1) — the only fund ever readable here remains report.fundId, gated
      // by the unchanged membership check below.
      fundSnapshot: { select: { fundName: true, snapshot: true } },
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

  // report.fundSnapshot.fundName (the row's own column, set at freeze time —
  // WS33.1) and report.fundSnapshot.snapshot.fundName (inside the frozen
  // JSON payload) are the same value by construction (buildFundReportSnapshot
  // always sets both from the same fund.name at publish); the JSON payload
  // already carries it, so no need to duplicate it into the object literal.
  const fundSnapshot: FundSnapshotPayload | null = report.fundSnapshot
    ? (report.fundSnapshot.snapshot as unknown as FundSnapshotPayload)
    : null;

  return (
    <div>
      <Link href="/lp" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-tide print:hidden">
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
        fundSnapshot={fundSnapshot}
      />
    </div>
  );
}
