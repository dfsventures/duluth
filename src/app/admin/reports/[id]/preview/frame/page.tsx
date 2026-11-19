import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { ReportView } from "@/components/report-view";
import { SurfaceSync } from "@/components/layout/surface-sync";
import { loadReportPreview } from "@/lib/report-preview";

export const dynamic = "force-dynamic";

/**
 * The report preview as LPs see it (WS172), for the same-origin frame in the new-look preview page.
 * No AppShell, so no admin surface anywhere in this document and no new-look rule can match: the
 * wrapper and padding are the LP layout's own (lp/layout.tsx), and the report renders exactly as
 * /lp/reports/[id] does. Read-only: no actions and no API. Same admin check as the preview page.
 */
export default async function AdminReportPreviewFramePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN")) {
    redirect("/login");
  }

  const { id } = await params;
  const data = await loadReportPreview(id);
  if (!data) notFound();
  const { report, mentions, fundSnapshot } = data;

  return (
    <div data-surface="founder" className="lp-print-scope min-h-screen bg-background px-6 py-12 text-foreground sm:px-10 sm:py-16">
      <SurfaceSync surface="founder" />
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
    </div>
  );
}
