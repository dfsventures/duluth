import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Filter bar (PLAN-1, WS158, pattern 3): a 44px strip under the page header (52px on phones).
// A filter that is not set is a dashed chip with a plus; a set one is tinted, shows its value,
// and has an x. "Clear filters" appears when anything is set. Presentational only: the page owns
// the filter state. DataTable uses it under the new look (WS160): its chips stay single-choice,
// so each one is an unset (dashed) chip until it is picked, and picking it sets it.
// Density (comfortable): chips are 28px (32px on phones). On phones the 44px tap area comes from
// a pseudo-element that extends above and below the chip, so the chips themselves stay short.
// Side padding is the list's row padding when the bar sits in a list (so the chips line up with
// the rows), else the gutter.

const TAP = "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] md:after:hidden";

export interface FilterBarChip {
  key: string;
  label: string;
  /** Set when the filter has a value, e.g. "Sam Admin". */
  value?: string;
  /** For filters with no separate value (a single-choice chip): set means picked. Defaults to "has a value". */
  set?: boolean;
  /** A live count shown after the label, e.g. how many rows the chip would show. */
  count?: number;
}

interface FilterBarProps {
  chips: FilterBarChip[];
  /** Open the picker for an unset chip, or change a set one. */
  onOpen: (key: string) => void;
  onRemove: (key: string) => void;
  onClearAll: () => void;
  /** Controls before the chips (a search box). */
  leading?: React.ReactNode;
  /** Controls after the chips, pushed to the right edge (a group select, export). */
  trailing?: React.ReactNode;
  /** Names the group for assistive tech. Default "Filters". */
  label?: string;
  /** Show "Clear filters" even when no chip is set (a search text counts as a filter). Default: when a chip is set. */
  showClear?: boolean;
  className?: string;
}

export function FilterBar({ chips, onOpen, onRemove, onClearAll, leading, trailing, label = "Filters", showClear, className }: FilterBarProps) {
  const isSet = (c: FilterBarChip) => c.set ?? Boolean(c.value);
  const anySet = showClear ?? chips.some(isSet);
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex h-11 flex-none items-center gap-2 overflow-x-auto border-b border-border px-[var(--row-pad,var(--gutter,24px))] text-meta max-md:h-[52px]",
        className
      )}
    >
      {leading}
      {chips.map((c) =>
        isSet(c) ? (
          <span
            key={c.key}
            className="inline-flex h-7 items-center gap-1 rounded bg-[var(--color-accent-soft,transparent)] pl-3 pr-0.5 font-medium text-primary max-md:h-8"
          >
            <button
              type="button"
              aria-pressed="true"
              onClick={() => onOpen(c.key)}
              className={"relative inline-flex items-center gap-1 whitespace-nowrap " + TAP}
            >
              {c.label}
              {c.value && <span className="font-normal text-secondary">{c.value}</span>}
              {c.count !== undefined && <span className="num font-normal text-secondary">{c.count}</span>}
            </button>
            <button
              type="button"
              onClick={() => onRemove(c.key)}
              aria-label={`Remove ${c.label} filter`}
              className="relative grid h-6 w-6 place-items-center rounded-sm hover:bg-row-hover max-md:h-8 max-md:w-8 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] md:after:hidden"
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <button
            key={c.key}
            type="button"
            aria-pressed="false"
            onClick={() => onOpen(c.key)}
            className={
              "relative inline-flex h-7 items-center gap-1 whitespace-nowrap rounded border border-dashed border-[var(--color-ctl,currentColor)] px-3 text-secondary hover:bg-row-hover max-md:h-8 " +
              TAP
            }
          >
            <span aria-hidden="true">+</span>
            {c.label}
            {c.count !== undefined && <span className="num text-muted-foreground">{c.count}</span>}
          </button>
        )
      )}
      {anySet && (
        <button
          type="button"
          onClick={onClearAll}
          className={"relative h-7 whitespace-nowrap rounded px-2 text-secondary hover:bg-row-hover max-md:h-8 " + TAP}
        >
          Clear filters
        </button>
      )}
      {trailing && <div className="ml-auto flex flex-none items-center gap-2 pl-2">{trailing}</div>}
    </div>
  );
}
