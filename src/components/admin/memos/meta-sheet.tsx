"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ModalSheet } from "@/components/ui/sheet";
import { toast } from "@/lib/toast";
import { MEMO_DECISIONS, MEMO_DECISION_LABELS, MEMO_DECISION_NOUN, MEMO_LIMITS, MEMO_SOURCES } from "@/lib/memos";
import { readError, type MemoIntroCall, type MemoView } from "./types";

/** Edit the memo's details (title, source, tags, intro date, website, intro calls). Carries the memo `version`; a 409 says so. */
export function MetaSheet({ memo, onClose, onSaved }: { memo: MemoView; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(memo.title);
  const [source, setSource] = useState(memo.source ?? "");
  const [decision, setDecision] = useState(memo.decision ?? "");
  const [tags, setTags] = useState(memo.tags.join(", "));
  const [introDate, setIntroDate] = useState(memo.introDate ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(memo.websiteUrl ?? "");
  const [pending, setPending] = useState(memo.companyNamePending ?? "");
  const [calls, setCalls] = useState<MemoIntroCall[]>(memo.introCalls);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Only a memo with no company link has a typed name to edit (a ledger link counts as linked).
  const showPending = memo.companyRef.kind === "pending" || memo.companyRef.kind === "none";

  function patchCall(i: number, p: Partial<MemoIntroCall>) {
    setCalls((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        version: memo.version,
        title,
        source: source || null,
        decision: decision || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        introDate: introDate || null,
        websiteUrl: websiteUrl.trim() || null,
        introCalls: calls.map((c) => ({ ...c, label: c.label.trim() })),
      };
      if (showPending) body.companyNamePending = pending;
      const res = await fetch(`/api/admin/memos/${memo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't save the details."));
      toast.success("Details saved.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalSheet title="Memo details" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Input id="meta-title" label="Title" value={title} maxLength={MEMO_LIMITS.title} onChange={(e) => setTitle(e.target.value)} required />
        {showPending && (
          <Input
            id="meta-pending"
            label="Company name (not linked)"
            value={pending}
            maxLength={MEMO_LIMITS.title}
            onChange={(e) => setPending(e.target.value)}
          />
        )}
        <Select id="meta-source" label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Not set</option>
          {memo.source && !(MEMO_SOURCES as readonly string[]).includes(memo.source) && (
            <option value={memo.source}>{memo.source} (old option)</option>
          )}
          {MEMO_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select id="meta-decision" label={MEMO_DECISION_NOUN} value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="">None yet</option>
          {MEMO_DECISIONS.map((d) => (
            <option key={d} value={d}>
              {MEMO_DECISION_LABELS[d]}
            </option>
          ))}
        </Select>
        <Input id="meta-tags" label="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. AI, Infrastructure" />
        <Input id="meta-intro" label="Intro date" type="date" value={introDate} onChange={(e) => setIntroDate(e.target.value)} />
        <Input
          id="meta-website"
          label="Website"
          value={websiteUrl}
          maxLength={MEMO_LIMITS.url}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://"
        />
        <div className="space-y-2">
          <p className="label">Intro calls</p>
          {calls.map((c, i) => (
            <div key={i} className="space-y-2 border border-border p-3">
              <div className="flex gap-2">
                <Input
                  aria-label={`Intro call ${i + 1} label`}
                  placeholder="First call with Jane Founder"
                  value={c.label}
                  maxLength={MEMO_LIMITS.citationLabel}
                  onChange={(e) => patchCall(i, { label: e.target.value })}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove intro call ${i + 1}`} onClick={() => setCalls((cs) => cs.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label={`Intro call ${i + 1} date`} type="date" value={c.date ?? ""} onChange={(e) => patchCall(i, { date: e.target.value || undefined })} />
                <Input aria-label={`Intro call ${i + 1} link`} placeholder="https://" value={c.url ?? ""} onChange={(e) => patchCall(i, { url: e.target.value || undefined })} />
              </div>
            </div>
          ))}
          {calls.length < MEMO_LIMITS.introCalls && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setCalls((cs) => [...cs, { label: "" }])}>
              <Plus className="h-4 w-4" />
              Add intro call
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!title.trim()}>
            Save details
          </Button>
        </div>
      </form>
    </ModalSheet>
  );
}
