interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Small status next to the title, e.g. a RefreshIndicator. */
  indicator?: React.ReactNode;
}

export function PageHeader({ title, description, action, indicator }: PageHeaderProps) {
  return (
    // Stacks on phones (buttons drop below the title instead of pushing
    // off-screen); side-by-side from sm: up.
    // New look (PLAN-1, WS158): the same markup becomes a sticky 44px bar with the title,
    // the description as quiet text beside it, and the action on the right. The bar's
    // geometry lives in globals.css (.shell-header); the rest is `v2:` classes.
    <div className="shell-header mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between v2:flex-row v2:flex-wrap v2:items-center v2:justify-between v2:gap-x-3 v2:gap-y-1">
      <div className="min-w-0 v2:flex v2:flex-1 v2:items-baseline v2:gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground v2:shrink-0 v2:text-row v2:font-medium v2:tracking-normal">
          {title}
          {indicator}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground v2:mt-0 v2:min-w-0 v2:truncate v2:text-meta max-sm:v2:sr-only">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
