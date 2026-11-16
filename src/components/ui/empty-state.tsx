import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  /** Mono label naming the screen ("Companies"). Page-level, first-run states use it. */
  eyebrow?: string;
  /** One line: what is empty. */
  title: string;
  /** One line: what this screen is for. */
  description?: string;
  /** The one primary action. */
  action?: React.ReactNode;
  /** At most one secondary action, beside the primary. */
  secondaryAction?: React.ReactNode;
  /**
   * For first-run states: the exact format or an example row (a CSV header, say).
   * Rendered as a mono block, so people can see what to bring.
   */
  example?: React.ReactNode;
  className?: string;
}

/**
 * Two uses (spec 6.7): "none yet" invites the action (pass `action`, and an
 * `example` where there is a format to follow); "filtered" says what matched
 * nothing and offers Clear filters as its action.
 */
export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  action,
  secondaryAction,
  example,
  className,
}: EmptyStateProps) {
  return (
    // New look (PLAN-1, WS159, pattern 12): one compact left-aligned line. No icon, no eyebrow;
    // the same title and description words, with the action on the same line (or just below
    // when the screen is narrow). Under the old look the layout is the centred box it always was.
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        "v2:flex-row v2:flex-wrap v2:items-center v2:justify-start v2:gap-x-3 v2:gap-y-1 v2:py-3 v2:text-left",
        className
      )}
    >
      {icon && (
        <div aria-hidden="true" className="mb-4 text-muted-foreground v2:hidden">
          {icon}
        </div>
      )}
      {eyebrow && (
        <p className="mb-2 font-mono text-label font-semibold uppercase tracking-label text-muted-foreground v2:hidden">{eyebrow}</p>
      )}
      <h3 className="font-display text-heading text-foreground v2:font-sans v2:text-row v2:font-medium">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground v2:mt-0 v2:max-w-none v2:text-meta">{description}</p>
      )}
      {example && (
        <div className="mt-4 max-w-full overflow-x-auto border border-border bg-card px-4 py-3 text-left font-mono text-xs text-foreground v2:mt-1 v2:basis-full">
          {example}
        </div>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 v2:mt-0 v2:justify-start">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
