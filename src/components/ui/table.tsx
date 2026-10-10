"use client";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export function Table({
  className,
  tableClassName,
  children,
}: {
  className?: string;
  // Per-page min-width (e.g. "min-w-[960px]") so overflow-x-auto keeps
  // scrolling the table horizontally on narrow viewports instead of
  // squishing columns — each adopting page has a different column count,
  // so this can't be a fixed default baked into the primitive. Also used
  // below as the signal that a page has declared itself "wide" — only
  // then do we render the mobile "scroll horizontally" caption.
  tableClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          "overflow-x-auto rounded-md border border-border bg-card",
          // Right-edge fade signalling more content horizontally. Pure CSS via
          // background-attachment: local — the gradient is painted against
          // the scroll container, so it fades out on its own once you reach the
          // right edge. No JS, so this stays usable inside Server Components
          // (e.g. /admin/audit). Part 32, WS83 / JC-UI-B.
          "table-scroll-fade",
          className
        )}
      >
        <table className={cn("w-full text-sm", tableClassName)}>{children}</table>
      </div>
      {tableClassName && (
        <p className="mt-2 text-xs text-muted-foreground sm:hidden">
          Scroll horizontally to see all columns.
        </p>
      )}
    </>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    // Phase 3: same header as DataTable. Label type on the surface, no grey fill.
    <thead className="sticky top-0 z-10 bg-card">
      <tr className="border-b border-border text-left text-muted-foreground">{children}</tr>
    </thead>
  );
}

// Plain (non-sortable) header cell — used as-is by files that adopt Table/TableHead
// later (WS31) without needing sort.
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn("h-[34px] whitespace-nowrap px-4 font-mono text-label font-semibold uppercase tracking-label", className)}
    >
      {children}
    </th>
  );
}

// Sortable header cell — only used where Q38 = A.
export function SortableTh<K extends string>({
  label, sortKey, active, dir, onSort, className,
}: { label: string; sortKey: K; active: boolean; dir: "asc" | "desc"; onSort: (key: K) => void; className?: string }) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("h-[34px] whitespace-nowrap px-4 font-mono text-label font-semibold uppercase tracking-label", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-label hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground"
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp aria-hidden="true" className="h-3 w-3" /> : <ChevronDown aria-hidden="true" className="h-3 w-3" />
        ) : (
          <ChevronsUpDown aria-hidden="true" className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

export function TableRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-row-divider last:border-0 hover:bg-row-hover", className)}>{children}</tr>;
}
