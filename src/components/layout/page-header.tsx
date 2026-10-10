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
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground">
          {title}
          {indicator}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
