import { cn } from "@/lib/utils";

// Notice (admin audit #5, #27, #36): one banner for "something needs your attention".
// Under the new look it is a tone fill with no border, 14px text, 12px / 16px padding and the
// control radius. Under the old look it keeps the bordered tint the pages always had, so the
// old pages are unchanged: callers that had their own old-look spacing pass it in className.

export type NoticeTone = "amber" | "clay" | "sky";

const BASE = "rounded-md border px-4 py-3 text-sm v2:min-h-10 v2:rounded-ctl v2:border-transparent v2:px-4 v2:py-3 v2:text-row";

const TONES: Record<NoticeTone, string> = {
  amber: "border-ochre/30 bg-ochre/10 text-foreground v2:bg-tone-amber v2:text-foreground",
  clay: "border-laterite/30 bg-laterite/10 text-tone-clay-ink v2:bg-tone-clay v2:text-tone-clay-ink",
  sky: "border-border bg-well text-foreground v2:bg-tone-sky v2:text-foreground",
};

/** The class string, for places that cannot take a wrapper element. */
export function noticeClasses(tone: NoticeTone = "amber", className?: string) {
  return cn(BASE, TONES[tone], className);
}

interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: NoticeTone;
  /** A small button or link on the right (new look: sits at the end of the row). */
  action?: React.ReactNode;
}

export function Notice({ tone = "amber", action, className, children, ...rest }: NoticeProps) {
  if (!action) {
    return (
      <div className={noticeClasses(tone, className)} {...rest}>
        {children}
      </div>
    );
  }
  return (
    <div className={noticeClasses(tone, cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className))} {...rest}>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex flex-none items-center gap-2">{action}</div>
    </div>
  );
}
