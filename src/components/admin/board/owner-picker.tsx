"use client";

import { X } from "lucide-react";
import { MAX_OWNERS_PER_CARD } from "@/lib/board";
import { cn } from "@/lib/utils";

// Part 38: equal co-owners. Chips (label + remove) followed by an "Add owner…"
// select listing only people not already chosen; disabled at MAX_OWNERS_PER_CARD.
// `reservedSlots` counts owner slots held by something else (the composer's
// unmatched names), so the cap covers resolved + unmatched together (JC-MO-C).
export function OwnerPicker({
  id,
  label = "Owners",
  people,
  allPeople,
  value,
  onChange,
  compact,
  reservedSlots = 0,
  hideHint,
}: {
  id: string;
  label?: string;
  /** People that can be added (archived people already filtered out by the caller). */
  people: { id: string; label: string }[];
  /** Used only to label chips of people who are not in `people` (archived owners). */
  allPeople?: { id: string; label: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
  reservedSlots?: number;
  hideHint?: boolean;
}) {
  const labelOf = (pid: string) => (allPeople ?? people).find((p) => p.id === pid)?.label ?? "Former member";
  const available = people.filter((p) => !value.includes(p.id));
  const full = value.length + reservedSlots >= MAX_OWNERS_PER_CARD;

  return (
    <div className="space-y-1">
      {!compact && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <div className={cn("flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
        {value.length === 0 && reservedSlots === 0 && (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        )}
        {value.map((pid) => (
          <span
            key={pid}
            className="inline-flex items-center gap-1 border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
          >
            {labelOf(pid)}
            <button
              type="button"
              aria-label={`Remove ${labelOf(pid)}`}
              onClick={() => onChange(value.filter((x) => x !== pid))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <select
          id={id}
          aria-label={compact ? label : undefined}
          className={cn("input-field", compact ? "h-9 w-full text-xs sm:w-44" : "w-auto min-w-[10rem]")}
          value=""
          disabled={full || available.length === 0}
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">{full ? `Maximum ${MAX_OWNERS_PER_CARD} owners` : "Add owner…"}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {!compact && !hideHint && (
        <p className="text-xs text-muted-foreground">Up to {MAX_OWNERS_PER_CARD}. Everyone listed owns it equally.</p>
      )}
    </div>
  );
}
