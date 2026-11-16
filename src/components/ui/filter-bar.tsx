import { X } from "lucide-react";

// Filter bar (PLAN-1, WS158, pattern 3): a 40px strip under the page header. A filter that is
// not set is a dashed chip with a plus; a set one is tinted, shows its value, and has an x.
// "Clear all" appears when anything is set. Presentational only: the page owns the filter state.
// Not yet used by DataTable (its chips are a single-choice group); WS160 decides how lists use it.

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
        "flex h-10 flex-none items-center gap-1.5 overflow-x-auto border-b border-border px-4 text-meta " + (className ?? "")
      }
    >
      {chips.map((c) =>
        c.value ? (
          <span
            key={c.key}
            className="inline-flex h-6 items-center gap-1 rounded bg-[var(--color-accent-soft,transparent)] pl-2 pr-0.5 font-medium text-primary"
          >
            <button
              type="button"
              onClick={() => onOpen(c.key)}
              className="inline-flex items-center gap-1 whitespace-nowrap max-md:min-h-11"
            >
              {c.label} <span className="font-normal text-secondary">{c.value}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(c.key)}
              aria-label={`Remove ${c.label} filter`}
              className="grid h-5 w-5 place-items-center rounded-sm hover:bg-row-hover max-md:h-11 max-md:w-11"
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <button
            key={c.key}
            type="button"
            onClick={() => onOpen(c.key)}
            className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded border border-dashed border-[var(--color-ctl,currentColor)] px-2 text-secondary hover:bg-row-hover max-md:h-11"
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
          className="h-6 whitespace-nowrap rounded px-1.5 text-secondary hover:bg-row-hover max-md:h-11"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
