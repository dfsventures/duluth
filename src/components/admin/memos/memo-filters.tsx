import { Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEMO_DECISIONS, MEMO_DECISION_LABELS, MEMO_DECISION_NOUN, MEMO_STATUSES, MEMO_STATUS_LABELS, MEMO_STATUS_NOUN } from "@/lib/memos";
import { targetValue, type LinkTargets } from "@/components/admin/memos/types";

/** F145: the DataTable toolbar control height and type size. */
const SELECT =
  "h-8 w-auto rounded-ctl border border-input bg-card py-0 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface MemoFilterValues {
  companyId: string;
  status: string;
  decision: string;
  unlinked: boolean;
}

/** Part 43: the list's filter controls as one controlled piece. The board hides the Decision select. */
export function MemoFilters({
  targets,
  companyId,
  status,
  decision,
  unlinked,
  showDecision,
  onChange,
}: MemoFilterValues & { targets: LinkTargets; showDecision: boolean; onChange: (patch: Partial<MemoFilterValues>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Company" className={SELECT} value={companyId} onChange={(e) => onChange({ companyId: e.target.value })}>
        <option value="">All companies</option>
        <optgroup label="Companies in Molly">
          {targets.companies.map((c) => (
            <option key={targetValue(c)} value={targetValue(c)}>
              {c.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Deal Ledger">
          {targets.ledger.map((c) => (
            <option key={targetValue(c)} value={targetValue(c)}>
              {c.name}
            </option>
          ))}
        </optgroup>
      </select>
      <select aria-label={MEMO_STATUS_NOUN} className={SELECT} value={status} onChange={(e) => onChange({ status: e.target.value })}>
        <option value="">Any memo status</option>
        {MEMO_STATUSES.map((s) => (
          <option key={s} value={s}>
            {MEMO_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {showDecision && (
        <select aria-label={MEMO_DECISION_NOUN} className={SELECT} value={decision} onChange={(e) => onChange({ decision: e.target.value })}>
          <option value="">Any stage</option>
          {MEMO_DECISIONS.map((d) => (
            <option key={d} value={d}>
              {MEMO_DECISION_LABELS[d]}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        aria-pressed={unlinked}
        onClick={() => onChange({ unlinked: !unlinked })}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-chip border px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          unlinked
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-card text-secondary hover:border-[var(--color-border-hover)] hover:text-foreground"
        )}
      >
        <Link2Off aria-hidden className="h-3.5 w-3.5" />
        Not linked
      </button>
    </div>
  );
}
