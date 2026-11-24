import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ComposerTopBar } from "@/components/composer/composer-top-bar";
import { loadReportPreview } from "@/lib/report-preview";

export default async function AdminReportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN")) {
    redirect("/login");
  }

  const { id } = await params;
  // The frame renders the report; this only checks it exists, so a bad id is a 404 here too.
  const data = await loadReportPreview(id);
  if (!data) notFound();

  return (
    <AppShell width="narrow">
      {/* Audit #29; page types v1 §4.3, preview variant: the editor bar with "‹ Report" and what this is,
          and no right-hand button (the back link is the way to the editor). */}
      <ComposerTopBar
        back={{ href: `/admin/reports/${id}`, label: "Report" }}
        draftLabel="Preview"
        saveStateLabel="How LPs will see it. Numbers aren’t frozen until you publish."
        statusExtra={<span className="hidden text-muted-foreground v2dark:inline">· Shown in light mode, as LPs see it</span>}
        showPublish={false}
      />
      {/* The report in the LP look (WS172, WS168), in a same-origin frame (allowed by frame-ancestors
          'self'), so the preview matches what LPs see at /lp/reports/[id]. */}
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
