"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { MEMO_LIMITS, type MemoTemplateSection } from "@/lib/memos";
import { readError } from "@/components/admin/memos/types";

interface Row extends MemoTemplateSection {
  /** Stable React key; new rows have no `key` yet (the server derives it from the title). */
  rid: number;
}

export default function TemplateEditor({ version, sections }: { version: number; sections: MemoTemplateSection[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => sections.map((s, i) => ({ ...s, rid: i })));
  const [nextId, setNextId] = useState(sections.length);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patch = (rid: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...p } : r)));
  function move(i: number, d: -1 | 1) {
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/memos/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: rows.map((r) => ({
            key: r.key || undefined,
            title: r.title,
            guidance: r.guidance,
            required: r.required,
            shareByDefault: r.shareByDefault,
          })),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't save the template."));
      const { version: v } = await res.json();
      toast.success(`Template saved as version ${v}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <Breadcrumb items={[{ label: "Memos", href: "/admin/memos" }, { label: "Template" }]} />
      <PageHeader
        title="Memo template"
        description={`Version ${version}. The sections every new memo starts with.`}
        action={
          <Button onClick={save} loading={saving} disabled={rows.length === 0 || rows.some((r) => !r.title.trim())}>
            Save as new version
          </Button>
        }
      />
      <div className="mb-6 border border-edge bg-muted/40 p-3 text-sm">Changes apply to new memos only. Memos already started keep the sections they have.</div>

      <div className="space-y-4">
        {rows.map((r, i) => (
          <Card key={r.rid}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label={`Section ${i + 1} title`}
                  value={r.title}
                  maxLength={MEMO_LIMITS.sectionTitle}
                  onChange={(e) => patch(r.rid, { title: e.target.value })}
                />
                <p className="mt-1 font-mono text-xs text-muted-foreground">{r.key ? `key: ${r.key}` : "key: set from the title when saved"}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" aria-label={`Move ${r.title || "section"} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Move ${r.title || "section"} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remove ${r.title || "section"}`} onClick={() => setRows((rs) => rs.filter((x) => x.rid !== r.rid))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Textarea
              aria-label={`Guidance for ${r.title || "section"}`}
              className="min-h-[72px]"
              value={r.guidance}
              maxLength={2000}
              onChange={(e) => patch(r.rid, { guidance: e.target.value })}
              placeholder="Guidance shown while the section is empty, and given to Marge when it drafts."
            />
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={r.required} onChange={(e) => patch(r.rid, { required: e.target.checked })} />
                Required
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={r.shareByDefault} onChange={(e) => patch(r.rid, { shareByDefault: e.target.checked })} />
                Include in share links by default
              </label>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={rows.length >= MEMO_LIMITS.sections}
          onClick={() => {
            setRows((rs) => [...rs, { rid: nextId, key: "", title: "", guidance: "", required: false, shareByDefault: true }]);
            setNextId((n) => n + 1);
          }}
        >
          <Plus className="h-4 w-4" />
          Add section
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </AppShell>
  );
}
