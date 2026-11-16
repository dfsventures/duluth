import { X } from "lucide-react";

// Filter bar (PLAN-1, WS158, pattern 3): a 44px strip under the page header (52px on phones).
// A filter that is not set is a dashed chip with a plus; a set one is tinted, shows its value,
// and has an x. "Clear all" appears when anything is set. Presentational only: the page owns
// the filter state. Not yet used by DataTable (its chips are a single-choice group); WS160
// decides how lists use it.
// Density (comfortable): chips are 28px (32px on phones). On phones the 44px tap area comes from
// a pseudo-element that extends above and below the chip, so the chips themselves stay short.

const TAP = "after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] md:after:hidden";

export interface FilterBarChip {
  key: string;
  label: string;
  /** Set when the filter has a value, e.g. "Sam Admin". */
  value?: string;
}

interface FilterBarProps {
  chips: FilterBarChip[];
  /** Open the picker for an unset chip, or change a set one. */
  onOpen: (key: string) => void;
  onRemove: (key: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function FilterBar({ chips, onOpen, onRemove, onClearAll, className }: FilterBarProps) {
  const anySet = chips.some((c) => c.value);
  return (
    <div
      role="group"
      aria-label="Filters"
      className={
        "flex h-11 flex-none items-center gap-2 overflow-x-auto border-b border-border px-6 text-meta max-md:h-[52px] max-md:px-5 " +
        (className ?? "")
      }
    >
      {chips.map((c) =>
        c.value ? (
          <span
            key={c.key}
            className="inline-flex h-7 items-center gap-1 rounded bg-[var(--color-accent-soft,transparent)] pl-3 pr-0.5 font-medium text-primary max-md:h-8"
          >
            <button
              type="button"
              onClick={() => onOpen(c.key)}
              className={"relative inline-flex items-center gap-1 whitespace-nowrap " + TAP}
            >
              {c.label} <span className="font-normal text-secondary">{c.value}</span>
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
            onClick={() => onOpen(c.key)}
            className={
              "relative inline-flex h-7 items-center gap-1 whitespace-nowrap rounded border border-dashed border-[var(--color-ctl,currentColor)] px-3 text-secondary hover:bg-row-hover max-md:h-8 " +
              TAP
            }
          >
            <span aria-hidden="true">+</span>
            {c.label}
          </button>
        )
      )}
      {anySet && (
        <button
          type="button"
          onClick={onClearAll}
          className={"relative h-7 whitespace-nowrap rounded px-2 text-secondary hover:bg-row-hover max-md:h-8 " + TAP}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
