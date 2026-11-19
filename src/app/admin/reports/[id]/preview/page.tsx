import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ReportView } from "@/components/report-view";
import { loadReportPreview } from "@/lib/report-preview";

export default async function AdminReportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN")) {
    redirect("/login");
  }

  const { id } = await params;
  const data = await loadReportPreview(id);
  if (!data) notFound();
  const { report, mentions, fundSnapshot } = data;

  return (
    <AppShell>
      {/* Old look: the report rendered in place, as before. New look: hidden, and the same report
          shows in the frame below, in the LP look (WS172), so the preview matches what LPs see. */}
      <div className="v2:hidden">
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
      {/* Same-origin frame (allowed by frame-ancestors 'self'). Never loaded in the old look:
          `hidden` keeps it undisplayed, and a lazy frame that is not displayed is not fetched. */}
      <iframe
        src={`/admin/reports/${id}/preview/frame`}
        title="Report as LPs see it"
        loading="lazy"
        className="hidden w-full border-0 v2:block v2:h-[calc(100dvh-var(--bar-h)-48px)] v2:rounded-lg v2:border v2:border-solid v2:border-border"
      />
    </AppShell>
  );
}
