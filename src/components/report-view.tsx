import { MentionCards, type MentionCardData } from "@/components/mention-cards";

interface ReportViewProps {
  title: string;
  periodLabel: string | null;
  publishedAt: string | Date | null;
  fundName: string;
  bodyHtml: string;
  mentions: MentionCardData[];
  /** "PREVIEW — draft, numbers not frozen" banner (admin draft preview only). */
  previewBanner?: boolean;
}

/**
 * Shared letter-style report renderer (Part 7, WS17.4) — used by both the
 * admin preview and (later, WS18) the LP report page, so the preview is
 * honest: whatever the admin sees here is exactly what an LP would see.
 * Draft previews pass live-computed snapshots; published pages pass frozen
 * ones — this component can't tell the difference, by design.
 */
export function ReportView({ title, periodLabel, publishedAt, fundName, bodyHtml, mentions, previewBanner }: ReportViewProps) {
  return (
    <article className="mx-auto max-w-2xl">
      {previewBanner && (
        <div className="mb-6 rounded-md border border-ochre/30 bg-ochre/10 px-4 py-2 text-center font-mono text-xs uppercase tracking-[0.08em] text-ochre">
          Preview — draft, numbers not frozen
        </div>
      )}

      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {fundName}
        {periodLabel ? ` · ${periodLabel}` : ""}
      </p>
      <h1 className="mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">{title}</h1>
      {publishedAt && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Published{" "}
          {new Date(publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      )}

      <div className="report-body prose prose-sm mt-8 max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

      <MentionCards mentions={mentions} />
    </article>
  );
}
