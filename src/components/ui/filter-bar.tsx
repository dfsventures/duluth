import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Filter row (page types v1, §4.1, D7–D11). New look only. Order, left to right: the search box,
// then one-choice filters (a segmented control), then selects (`filters`), then set filters (chips),
// then Clear. The right end (`trailing`, pushed with margin-left: auto) holds only the count and view
// controls, never a filter. Every control is 36px high; the row wraps (8px between lines) when it
// must, and the search never shrinks below 280. Presentational only: the page owns the filter state.
// Phones: controls are 44px tall (the search is 16px text, so iOS does not zoom).

export interface FilterBarChip {
  key: string;
  label: string;
  /** Set when the filter has a value, e.g. "Sam Admin". */
  value?: string;
  /** For filters with no separate value (a single-choice chip): set means picked. Defaults to "has a value". */
  set?: boolean;
  /** A live count shown after the label, e.g. how many rows the chip would show. */
  count?: number;
  /** The "All" choice of a one-choice group. */
  plain?: boolean;
}

interface FilterBarProps {
  chips: FilterBarChip[];
  /** Open the picker for an unset chip, or change a set one (for a segmented control: pick it). */
  onOpen: (key: string) => void;
  onRemove: (key: string) => void;
  onClearAll: () => void;
  /** The search box (FilterSearch), first in the row. */
  leading?: React.ReactNode;
  /** Page filters (selects) after the chips, still in the left group. */
  filters?: React.ReactNode;
  /** The right end: the count, then view controls (group, columns, export). */
  trailing?: React.ReactNode;
  /** Names the group for assistive tech. Default "Filters". */
  label?: string;
  /** Show "Clear filters" even when no chip is set (a search text counts as a filter). Default: when a chip is set. */
  showClear?: boolean;
  /**
   * The chips are one choice out of several (All, Current, Behind): drawn as one segmented control
   * (D9) instead of separate chips. DataTable's chips are always this.
   */
  segmented?: boolean;
  className?: string;
}

const CTL = "h-9 max-md:h-11";

/** A chip's live count: the bare number is drawn, a screen reader hears what it counts (", 4 matching"). */
function ChipCount({ count, className }: { count: number; className?: string }) {
  return (
    <>
      <span aria-hidden="true" className={cn("num", className)}>
        {count}
      </span>
      <span className="sr-only">{`, ${count} matching`}</span>
    </>
  );
}

export function FilterBar({
  chips,
  onOpen,
  onRemove,
  onClearAll,
  leading,
  filters,
  trailing,
  label = "Filters",
  showClear,
  segmented,
  className,
}: FilterBarProps) {
  const isSet = (c: FilterBarChip) => c.set ?? Boolean(c.value);
  const anySet = showClear ?? chips.some((c) => isSet(c) && !c.plain);
  return (
    <div
      role="group"
      aria-label={label}
      data-align="filters"
      className={cn(
        // relative: the row is the containing block for the visually hidden labels inside it (sr-only is
        // position: absolute), so they can't widen a phone page.
        // py-2 is the sticky row's own 8px of background; -mt-2 puts the controls themselves on the spec's
        // line (16 under tabs, 24 under a description), mb-2 makes 16 to the table head.
        "filter-row relative -mt-2 mb-2 flex flex-none flex-wrap items-center gap-2 py-2 text-row",
        className
      )}
    >
      {leading}
      {segmented && chips.length > 0 ? (
        // Phones (§6): the control never runs past the screen edge; it scrolls sideways inside it.
        <div
          role="radiogroup"
          aria-label={label}
          className={cn("seg inline-flex flex-none items-center rounded-md bg-[var(--color-surface)] p-0.5 max-md:max-w-full max-md:overflow-x-auto", CTL)}
        >
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={isSet(c)}
              onClick={() => onOpen(c.key)}
              className={cn(
                "inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-10",
                isSet(c) ? "seg-on text-foreground" : "text-secondary hover:text-foreground"
              )}
            >
              {c.label}
              {c.count !== undefined && <ChipCount count={c.count} className="text-meta font-normal text-muted-foreground" />}
            </button>
          ))}
        </div>
      ) : (
        chips.map((c) =>
          isSet(c) ? (
            <span
              key={c.key}
              className={cn("inline-flex flex-none items-center gap-1 rounded-ctl bg-[var(--color-accent-soft,transparent)] pl-3 pr-1", CTL)}
            >
              <button type="button" aria-pressed="true" onClick={() => onOpen(c.key)} className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className="font-medium text-primary">{c.label}</span>
                {c.value && <span className="text-foreground">{c.value}</span>}
                {c.count !== undefined && <ChipCount count={c.count} className="text-secondary" />}
              </button>
              <button
                type="button"
                onClick={() => onRemove(c.key)}
                aria-label={`Remove ${c.label} filter`}
                className="grid h-7 w-7 place-items-center rounded-sm hover:bg-row-hover"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <button
              key={c.key}
              type="button"
              aria-pressed="false"
              onClick={() => onOpen(c.key)}
              className={cn(
                "inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-ctl border border-dashed border-[var(--color-ctl,currentColor)] px-3 text-secondary hover:bg-row-hover",
                CTL
              )}
            >
              <span aria-hidden="true">+</span>
              {c.label}
              {c.count !== undefined && <ChipCount count={c.count} className="text-muted-foreground" />}
            </button>
          )
        )
      )}
      {/* Phones: the selects take the row's width, so they wrap inside it instead of running off the edge. */}
      {filters && (
        <div className="flex flex-none flex-wrap items-center gap-2 max-md:w-full [&_select]:min-w-[160px] [&_select]:max-w-[240px]">{filters}</div>
      )}
      {anySet && (
        <button type="button" onClick={onClearAll} className={cn("flex-none whitespace-nowrap rounded-ctl px-2 text-secondary hover:bg-row-hover", CTL)}>
          Clear filters
        </button>
      )}
      {trailing && (
        // Phones: the count and view controls wrap onto further lines rather than run off the edge (D11).
        <div data-align="filters-end" className="ml-auto flex flex-none items-center gap-4 pl-4 max-md:w-full max-md:flex-wrap max-md:gap-2 max-md:pl-0">
          {trailing}
        </div>
      )}
    </div>
  );
}

/**
 * The search box of a filter row (D8): 320 wide, never under 280 or over 400, a 16px icon 12 from the
 * left, text from 36, the "/" hint 8 from the right. Phones: the whole first line, 44 high, 16px text.
 */
export function FilterSearch({
  id,
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  inputRef,
  hint = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  inputRef?: React.Ref<HTMLInputElement>;
  hint?: boolean;
}) {
  return (
    <div data-align="search" className="relative w-80 min-w-[280px] max-w-[400px] flex-none max-md:w-full max-md:min-w-0 max-md:max-w-none">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="h-9 w-full rounded-ctl border border-[var(--color-ctl)] bg-transparent pl-9 pr-9 text-row text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-11 max-md:text-base"
      />
      {hint && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 hidden h-5 w-5 -translate-y-1/2 place-items-center rounded-sm border border-border font-sans text-[11px] text-muted-foreground sm:grid"
        >
          /
        </kbd>
      )}
    </div>
  );
}
