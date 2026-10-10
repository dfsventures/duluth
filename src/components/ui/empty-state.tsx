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
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      {icon && (
        <div aria-hidden="true" className="mb-4 text-muted-foreground">
          {icon}
        </div>
      )}
      {eyebrow && (
        <p className="mb-2 font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">{eyebrow}</p>
      )}
      <h3 className="font-display text-heading text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {example && (
        <div className="mt-4 max-w-full overflow-x-auto border border-border bg-card px-4 py-3 text-left font-mono text-xs text-foreground">
          {example}
        </div>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
