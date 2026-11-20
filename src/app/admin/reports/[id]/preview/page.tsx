import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
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
    <AppShell width="narrow">
      {/* New look (audit #29; page types v1 §4.3, preview variant): the editor bar with "‹ Report" and what
          this is, and no right-hand button (the back link is the way to the editor). Nothing under the old
          look (it never drew a bar here). */}
      <ComposerTopBar
        newLookOnly
        back={{ href: `/admin/reports/${id}`, label: "Report" }}
        draftLabel="Preview"
        saveStateLabel="How LPs will see it. Numbers aren’t frozen until you publish."
        statusExtra={<span className="hidden text-muted-foreground v2dark:inline">· Shown in light mode, as LPs see it</span>}
        showPublish={false}
      />
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
        // Full bleed under the bar: edge to edge, no border, no radius, one scroll (the frame's own).
        className="hidden border-0 v2:block v2:h-[calc(100dvh-var(--bar-h))] v2:w-[calc(100%+2*(var(--frame-off)+var(--page-pad)))] v2:max-w-none v2:mx-[calc((var(--frame-off)+var(--page-pad))*-1)] v2:-mt-10 max-md:v2:-mt-6"
      />
    </AppShell>
  );
}
