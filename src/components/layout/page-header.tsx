import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeaderMenu, type SecondaryAction } from "./page-header-menu";
import { CondensedBar } from "./condensed-bar";

export type { SecondaryAction };

interface PageHeaderProps {
  title: string;
  description?: string;
  /**
   * New look, Detail pages (page types v1, §4.2): the status line under the title ("Active · Fintech ·
   * Updated 2 days ago"). Drawn where the description goes; only under the new look.
   */
  status?: React.ReactNode;
  /** The primary action (and anything that must stay mounted, like a hidden file input). */
  action?: React.ReactNode;
  /**
   * New look: what the slim scroll bar carries as its action. Defaults to `action`. Pass it when `action`
   * holds something that must not be mounted twice (a hidden file input with a ref), or `null` for none.
   */
  condensedAction?: React.ReactNode;
  /**
   * Quieter actions that sit left of `action`. Desktop: buttons, as before. New look on phones
   * (below md): folded into a "⋯" menu so the title and the primary action keep one row.
   * Pages that don't pass this keep the wrapped-row behaviour.
   */
  secondaryActions?: SecondaryAction[];
  /** Small status next to the title, e.g. a RefreshIndicator. */
  indicator?: React.ReactNode;
  /**
   * New look: a quiet "‹ Label" link on its own line above the title (page types v1, D15/D16). Not drawn
   * under the old look (the page keeps its own breadcrumb).
   */
  back?: { href: string; label: string };
  /** The header is drawn only under the new look (a page that had no header in the old look). */
  newLookOnly?: boolean;
}

function headId(title: string) {
  return `page-head-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * The page header. Old look: the title block it always was. New look (page types v1, List and Detail):
 * an in-page header, not a bar. An optional "‹ Back" line, then the header row (a 24/32 h1 and the
 * actions, top-aligned, actions ending on the frame's right edge), then the description or status line
 * 4px under it. A slim bar with the title and main action slides in once the h1 scrolls away
 * (CondensedBar). Every piece carries a data-align mark for the alignment check in scripts/visual.
 */
export function PageHeader({
  title,
  description,
  status,
  action,
  condensedAction,
  secondaryActions,
  indicator,
  back,
  newLookOnly,
}: PageHeaderProps) {
  const folded = !!secondaryActions?.length;
  const id = headId(title);
  return (
    <>
      <CondensedBar headId={id} title={title} back={back} action={condensedAction === undefined ? action : condensedAction} />
      {/* Stacks on phones (buttons drop below the title instead of pushing off-screen); side-by-side from sm: up. */}
      <div
        id={id}
        data-page-head=""
        className={`page-head mb-8 ${newLookOnly ? "hidden v2:flex" : "flex"} flex-col gap-4 sm:flex-row sm:items-start sm:justify-between v2:mb-6 v2:flex-row v2:items-start v2:justify-between v2:gap-x-4 v2:gap-y-0 ${
          folded && !back ? "v2:flex-nowrap" : "v2:flex-wrap"
        }`}
      >
        {back && (
          <Link
            href={back.href}
            data-align="back"
            className="page-back hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring v2:inline-flex"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            {back.label}
          </Link>
        )}
        <div className="min-w-0 v2:flex-1">
          <h1
            data-align="title"
            className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground v2:min-h-9 v2:py-0.5 v2:font-sans v2:text-page-title max-md:v2:min-h-0 max-md:v2:py-1 max-md:v2:text-pane-title"
          >
            <span className={folded ? "v2:min-w-0 v2:break-words" : "v2:break-words"}>{title}</span>
            {indicator}
          </h1>
          {description && (
            <p data-align="desc" className="mt-1 text-sm text-muted-foreground v2:max-w-[720px] v2:text-row v2:text-secondary">
              {description}
            </p>
          )}
          {status && (
            <div data-align="desc" className="hidden v2:mt-1 v2:flex v2:flex-wrap v2:items-center v2:gap-x-2 v2:gap-y-1 v2:text-row v2:text-secondary">
              {status}
            </div>
          )}
        </div>
        {folded ? (
          // New look, phones: the secondary actions fold into "⋯" next to the primary action.
          <div data-align="actions" className="flex shrink-0 items-center gap-2">
            <PageHeaderMenu actions={secondaryActions!} />
            {action}
          </div>
        ) : (
          action && (
            // New look, phones: the actions take their own line under the title and wrap, instead of
            // running off the screen.
            <div
              data-align="actions"
              className="shrink-0 max-sm:v2:mt-4 max-sm:v2:w-full max-sm:v2:shrink max-sm:v2:[&>*]:flex-wrap"
            >
              {action}
            </div>
          )
        )}
      </div>
    </>
  );
}
