"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Archive, ArchiveRestore, LayoutTemplate, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { RichEditor } from "@/components/ui/rich-editor";
import { formatDate } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  description: string | null;
  body: string;
  archivedAt: string | null;
  updatedAt: string;
}

// Extracted panel body (no AppShell/PageHeader — the host page supplies
// those) — same extraction pattern as sync-panel.tsx. Templates moved off
// its own sidebar item/page onto a "Templates" tab on /admin/updates,
// since it's a sub-feature of Updates (the skeletons founders start an
// update from), not a peer-level destination.
export function TemplatesPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [editTarget, setEditTarget] = useState<Template | "new" | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formBody, setFormBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/templates");
      if (res.ok) setTemplates(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function openNew() {
    setEditTarget("new");
    setFormName("");
    setFormDescription("");
    setFormBody("");
    setSaveError("");
  }

  function openEdit(t: Template) {
    setEditTarget(t);
    setFormName(t.name);
    setFormDescription(t.description ?? "");
    setFormBody(t.body);
    setSaveError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const isNew = editTarget === "new";
      const url = isNew ? "/api/admin/templates" : `/api/admin/templates/${(editTarget as Template).id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, description: formDescription, body: formBody }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save template");
      }
      setEditTarget(null);
      loadTemplates();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchived(t: Template) {
    await fetch(`/api/admin/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !t.archivedAt }),
    });
    loadTemplates();
  }

  const active = templates.filter((t) => !t.archivedAt);
  const archived = templates.filter((t) => t.archivedAt);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Pre-filled skeletons founders can start their update from.</p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="h-8 w-8" />}
          title="No templates yet"
          description="Create a template so founders can start their update from a pre-filled skeleton."
          action={<Button onClick={openNew}>New Template</Button>}
        />
      ) : (
        <div className="space-y-6">
          <section>
            <div className="space-y-3">
              {active.map((t) => (
                <TemplateRow key={t.id} template={t} onEdit={() => openEdit(t)} onToggleArchive={() => toggleArchived(t)} />
              ))}
            </div>
          </section>

          {archived.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Archived ({archived.length})
              </h2>
              <div className="space-y-3">
                {archived.map((t) => (
                  <TemplateRow key={t.id} template={t} onEdit={() => openEdit(t)} onToggleArchive={() => toggleArchived(t)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {editTarget && (
        <Modal title={editTarget === "new" ? "New Template" : `Edit — ${(editTarget as Template).name}`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="label mb-1.5 block">Name *</label>
              <Input required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Quarterly Update" maxLength={120} />
            </div>
            <div>
              <label className="label mb-1.5 block">Description</label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="One-line hint shown to founders"
              />
            </div>
            <div>
              <label className="label mb-1.5 block">Content *</label>
              <RichEditor value={formBody} onChange={setFormBody} placeholder="Highlights / Lowlights / Metrics commentary / Asks..." />
            </div>
            {saveError && <p className="text-sm text-laterite">{saveError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function TemplateRow({
  template: t,
  onEdit,
  onToggleArchive,
}: {
  template: Template;
  onEdit: () => void;
  onToggleArchive: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
          <LayoutTemplate className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-foreground text-sm">{t.name}</span>
            {t.archivedAt && <span className="badge-warning">Archived</span>}
          </div>
          {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Updated {formatDate(t.updatedAt)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleArchive}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={t.archivedAt ? "Unarchive" : "Archive"}
          >
            {t.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
