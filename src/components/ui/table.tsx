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
  // so this can't be a fixed default baked into the primitive.
  tableClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-border", className)}>
      <table className={cn("w-full text-sm", tableClassName)}>{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-card">
      <tr className="border-b bg-muted/40 text-left text-muted-foreground">{children}</tr>
    </thead>
  );
}

// Plain (non-sortable) header cell — used as-is by files that adopt Table/TableHead
// later (WS31) without needing sort.
export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 font-medium", className)}>{children}</th>;
}

// Sortable header cell — only used where Q38 = A.
export function SortableTh<K extends string>({
  label, sortKey, active, dir, onSort, className,
}: { label: string; sortKey: K; active: boolean; dir: "asc" | "desc"; onSort: (key: K) => void; className?: string }) {
  return (
    <th
      className={cn("cursor-pointer select-none px-4 py-2.5 font-medium hover:text-foreground", className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </span>
    </th>
  );
}

export function TableRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b last:border-0 hover:bg-muted/50", className)}>{children}</tr>;
}
