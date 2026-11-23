import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { ReportView } from "@/components/report-view";
import { SurfaceSync } from "@/components/layout/surface-sync";
import { loadReportPreview } from "@/lib/report-preview";

export const dynamic = "force-dynamic";

/** LPs have no theme switch, so they always read in light: the frame shows the same, whatever the admin chose. */
const FORCE_LIGHT = `document.documentElement.dataset.theme="light";`;

/**
 * The report preview as LPs see it (WS172), for the same-origin frame in the preview page. No
 * AppShell: the wrapper, the main padding and the report column are the LP layout's and the LP
 * report page's own (lp/layout.tsx, lp/reports/[id]/page.tsx), so the report renders exactly as
 * /lp/reports/[id] does, in the LP look (since WS168, when that became the only look; before, both
 * kept the old look). Read-only: no actions and no API. Same admin check as the preview page.
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
    <div data-surface="founder" data-v2-scope="" className="lp-print-scope min-h-screen bg-background text-foreground">
      <script dangerouslySetInnerHTML={{ __html: FORCE_LIGHT }} />
      <SurfaceSync surface="founder" newLookScope />
      <main className="px-6 py-12 sm:px-10 sm:py-16 max-md:v2:px-5 max-md:v2:py-8">
        <div className="lp-report">
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
      </main>
    </div>
  );
}
