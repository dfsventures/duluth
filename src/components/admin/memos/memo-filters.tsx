import { MEMO_DECISIONS, MEMO_DECISION_LABELS, MEMO_DECISION_NOUN, MEMO_STATUSES, MEMO_STATUS_LABELS, MEMO_STATUS_NOUN } from "@/lib/memos";
import { targetValue, type LinkTargets } from "@/components/admin/memos/types";

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
    <div className="flex flex-wrap items-center gap-3">
      <select aria-label="Company" className="input-field w-auto" value={companyId} onChange={(e) => onChange({ companyId: e.target.value })}>
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
      <select aria-label={MEMO_STATUS_NOUN} className="input-field w-auto" value={status} onChange={(e) => onChange({ status: e.target.value })}>
        <option value="">Any memo status</option>
        {MEMO_STATUSES.map((s) => (
          <option key={s} value={s}>
            {MEMO_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {showDecision && (
        <select aria-label={MEMO_DECISION_NOUN} className="input-field w-auto" value={decision} onChange={(e) => onChange({ decision: e.target.value })}>
          <option value="">Any stage</option>
          {MEMO_DECISIONS.map((d) => (
            <option key={d} value={d}>
              {MEMO_DECISION_LABELS[d]}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={unlinked} onChange={(e) => onChange({ unlinked: e.target.checked })} />
        Not linked to a company
      </label>
    </div>
  );
}
