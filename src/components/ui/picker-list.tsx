import { Fragment } from "react";
import { cn } from "@/lib/utils";

// PickerList (admin audit #1, #2, #38): the one list for "tick the ones you want" and for
// "who is in this list". New look only; a page keeps its old markup for the old look.
// Hairline between rows, nothing else: no fill (the checkbox is the selection; hover is the
// standard row hover), no outer rounded box, a hairline above and below, no side borders.
// Rows are 40 high; group rows (company names) are 32 high, sentence case, no fill.

export interface PickerItem {
  id: string;
  label: React.ReactNode;
  /** Muted text right after the label, same line (a period, an email). */
  sub?: React.ReactNode;
  /** Right-hand meta (12/18 muted): a count, a company name. */
  meta?: React.ReactNode;
  /** Amber meta, e.g. "0 contacts". */
  warn?: boolean;
  /** Rows with the same group value that follow each other sit under one group row. */
  group?: string;
}

interface PickerListProps {
  items: PickerItem[];
  /** Ticked ids. Leave it out for a read-only list with no checkboxes. */
  selected?: string[];
  onToggle?: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

export function PickerList({ items, selected, onToggle, ariaLabel, className }: PickerListProps) {
  const checkable = selected !== undefined && onToggle !== undefined;
  let lastGroup: string | undefined;
  return (
    <div
      role={checkable ? "group" : "list"}
      aria-label={ariaLabel}
      className={cn("max-h-80 overflow-y-auto border-y border-row-divider", className)}
    >
      {items.map((it) => {
        const showGroup = it.group !== undefined && it.group !== lastGroup;
        lastGroup = it.group;
        const body = (
          <>
            {checkable && (
              <input
                type="checkbox"
                checked={selected!.includes(it.id)}
                onChange={() => onToggle!(it.id)}
                className="h-4 w-4 flex-none rounded border-border accent-primary"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-row text-foreground">
              {it.label}
              {it.sub && <span className="ml-2 text-meta text-muted-foreground">{it.sub}</span>}
            </span>
            {it.meta && (
              <span className={cn("flex-none text-meta", it.warn ? "text-tone-amber-ink" : "text-muted-foreground")}>{it.meta}</span>
            )}
          </>
        );
        const rowClass = "flex h-10 items-center gap-3 border-b border-row-divider px-3 last:border-b-0 hover:bg-row-hover";
        return (
          <Fragment key={it.id}>
            {showGroup && (
              <div role="presentation" className="flex h-8 items-center border-b border-row-divider px-3 text-meta font-medium text-muted-foreground">
                {it.group}
              </div>
            )}
            {checkable ? (
              <label className={cn(rowClass, "cursor-pointer")}>{body}</label>
            ) : (
              <div role="listitem" className={rowClass}>
                {body}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
