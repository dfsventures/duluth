import { cn } from "@/lib/utils";

/** Slow 1.4s opacity pulse on the `well` tone (spec 6.6). Not a shimmer sweep. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-skeleton-pulse rounded-sm bg-well", className)} />;
}

function Busy({ label = "Loading", children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Rows that match a real table's rhythm (44px rows). */
export function TableSkeleton({ rows = 6, cols = 4, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <Busy label="Loading table" className={cn("border border-border bg-card", className)}>
      <div className="flex h-[34px] items-center gap-6 border-b border-border px-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-11 items-center gap-6 border-b border-row-divider px-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3", c === 0 ? "w-40" : "w-20")} />
          ))}
        </div>
      ))}
    </Busy>
  );
}

/** A grid of cards, same padding as `.card`. */
export function CardSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <Busy label="Loading" className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </Busy>
  );
}

/** A row of KPI tiles. */
export function KpiSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <Busy label="Loading" className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </Busy>
  );
}

/** Page-level fallback: header block, then a few content rows. */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <Busy label="Loading page" className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Busy>
  );
}
