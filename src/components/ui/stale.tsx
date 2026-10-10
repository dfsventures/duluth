import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Spec 6.6: keep stale data visible during a refetch. Wrap the content that
 * stays on screen; it dims to 60% while `refreshing`, and `aria-busy` tells
 * assistive tech an update is in flight.
 */
export function StaleRegion({
  refreshing,
  className,
  children,
}: {
  refreshing: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div aria-busy={refreshing} className={cn("transition-opacity", refreshing && "opacity-60", className)}>
      {children}
    </div>
  );
}

/** Small spinner for a page header while data refetches. Renders nothing when idle. */
export function RefreshIndicator({ active }: { active: boolean }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex h-4 w-4 items-center justify-center">
      {active && (
        <>
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="sr-only">Refreshing</span>
        </>
      )}
    </span>
  );
}
