import { PageHeaderMenu, type SecondaryAction } from "./page-header-menu";

export type { SecondaryAction };

interface PageHeaderProps {
  title: string;
  description?: string;
  /** The primary action (and anything that must stay mounted, like a hidden file input). */
  action?: React.ReactNode;
  /**
   * Quieter actions that sit left of `action`. Desktop: buttons, as before. New look on phones
   * (below md): folded into a "⋯" menu so the title and the primary action keep one row.
   * Pages that don't pass this keep the wrapped-row behaviour.
   */
  secondaryActions?: SecondaryAction[];
  /** Small status next to the title, e.g. a RefreshIndicator. */
  indicator?: React.ReactNode;
}

export function PageHeader({ title, description, action, secondaryActions, indicator }: PageHeaderProps) {
  const folded = !!secondaryActions?.length;
  return (
    // Stacks on phones (buttons drop below the title instead of pushing
    // off-screen); side-by-side from sm: up.
    // New look (PLAN-1, WS158): the same markup becomes a sticky 52px bar with the title,
    // the description as quiet text beside it, and the action on the right. The bar's
    // geometry lives in globals.css (.shell-header); the rest is `v2:` classes.
    <div
      className={`shell-header mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between v2:flex-row v2:items-center v2:justify-between v2:gap-x-3 v2:gap-y-1 ${
        folded ? "v2:flex-nowrap md:v2:flex-wrap" : "v2:flex-wrap"
      }`}
    >
      <div className="min-w-0 v2:flex v2:flex-1 v2:items-baseline v2:gap-4">
        <h1
          className={`flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground v2:text-row v2:font-semibold v2:tracking-normal ${
            folded ? "v2:min-w-0 md:v2:shrink-0" : "v2:shrink-0"
          }`}
        >
          <span className={folded ? "v2:truncate" : undefined}>{title}</span>
          {indicator}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground v2:mt-0 v2:min-w-0 v2:truncate v2:border-l v2:border-border v2:pl-4 v2:text-meta max-sm:v2:border-l-0 max-sm:v2:pl-0 max-sm:v2:sr-only">
            {description}
          </p>
        )}
      </div>
      {folded ? (
        // New look, phones: the secondary actions fold into "⋯" next to the primary action.
        <div className="flex shrink-0 items-center gap-2">
          <PageHeaderMenu actions={secondaryActions!} />
          {action}
        </div>
      ) : (
        action && (
          // New look, phones: the actions take their own line under the title and wrap, instead of
          // running off the screen.
          <div className="shrink-0 max-sm:v2:w-full max-sm:v2:shrink max-sm:v2:pb-2 max-sm:v2:[&>*]:flex-wrap">{action}</div>
        )
      )}
    </div>
  );
}
