"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CITATION_KINDS, MEMO_LIMITS } from "@/lib/memos";
import type { CitationKind, MemoCitation } from "./types";

const KIND_LABELS: Record<CitationKind, string> = {
  call: "Call",
  deck: "Deck",
  tracker: "Tracker",
  web: "Web",
  other: "Other",
};

/** Editable list of a section's citations (label, kind, date, link). Plain controlled state; the server validates. */
export function CitationsEditor({ value, onChange }: { value: MemoCitation[]; onChange: (next: MemoCitation[]) => void }) {
  function patch(i: number, p: Partial<MemoCitation>) {
    onChange(value.map((c, j) => (j === i ? { ...c, ...p } : c)));
  }
  return (
    <div className="space-y-3">
      <p className="label">Citations</p>
      {value.length === 0 && <p className="text-xs text-muted-foreground">None. Cite the call, deck or page each claim came from.</p>}
      {value.map((c, i) => (
        <div key={i} className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_120px_150px_auto]">
          <Input
            aria-label={`Citation ${i + 1} label`}
            placeholder="Intro call with Jane Founder"
            value={c.label}
            maxLength={MEMO_LIMITS.citationLabel}
            onChange={(e) => patch(i, { label: e.target.value })}
          />
          <select
            aria-label={`Citation ${i + 1} kind`}
            className="input-field"
            value={c.kind}
            onChange={(e) => patch(i, { kind: e.target.value as CitationKind })}
          >
            {CITATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <Input
            aria-label={`Citation ${i + 1} date`}
            type="date"
            value={c.date ?? ""}
            onChange={(e) => patch(i, { date: e.target.value || undefined })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove citation ${i + 1}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="sm:col-span-4">
            <Input
              aria-label={`Citation ${i + 1} link`}
              placeholder="https:// (optional)"
              value={c.url ?? ""}
              maxLength={MEMO_LIMITS.url}
              onChange={(e) => patch(i, { url: e.target.value || undefined })}
            />
          </div>
        </div>
      ))}
      {value.length < MEMO_LIMITS.citationsPerSection && (
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...value, { label: "", kind: "call" }])}>
          <Plus className="h-4 w-4" />
          Add citation
        </Button>
      )}
    </div>
  );
}
