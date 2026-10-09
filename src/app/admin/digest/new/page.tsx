"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, Plus, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { plainToDigestHtml } from "@/lib/digest-html";

interface DigestSection {
  id: string;
  heading: string;
  content: string;
}

interface DigestTodo {
  text: string;
  ownerId: string | null;
  projectId: string | null;
  ownerRaw: string | null; // sent to the server; cleared when an admin picks a name
  projectRaw: string | null;
  heardOwner: string | null; // display only: what the notes said
  heardProject: string | null;
  existingCardId: string | null;
  dueDate: string | null;
}

interface Option { id: string; label: string }

function blankTodo(text: string): DigestTodo {
  return { text, ownerId: null, projectId: null, ownerRaw: null, projectRaw: null, heardOwner: null, heardProject: null, existingCardId: null, dueDate: null };
}

function unresolved(t: DigestTodo): boolean {
  return Boolean((t.heardOwner && !t.ownerId) || (t.heardProject && !t.projectId));
}

type Step = "paste" | "edit";

export default function NewDigestPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("paste");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Draft state
  const [title, setTitle] = useState("");
  const [weekOf, setWeekOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [sections, setSections] = useState<DigestSection[]>([]);
  const [todos, setTodos] = useState<DigestTodo[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [people, setPeople] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [openCardIds, setOpenCardIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/admin/board")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setPeople((d.people ?? []).map((p: { id: string; label: string }) => ({ id: p.id, label: p.label })));
        setProjects((d.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, label: p.name })));
        setOpenCardIds(
          (d.cards ?? [])
            .filter((c: { status: string; archivedAt: string | null }) => c.status !== "DONE" && !c.archivedAt)
            .map((c: { id: string }) => c.id)
        );
      })
      .catch(() => {});
  }, []);

  // Open cards not already restated in this draft are carried in automatically.
  const linkedIds = new Set(todos.map((t) => t.existingCardId).filter(Boolean) as string[]);
  const carriedCount = openCardIds.filter((cid) => !linkedIds.has(cid)).length;

  async function handleGenerate() {
    if (!notes.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/admin/digest/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Generation failed");
      }
      const data = await res.json();
      setTitle(data.title);
      setWeekOf(new Date(data.weekOf).toISOString().slice(0, 10));
      setSections(data.sections);
      setTodos(
        (data.todos ?? []).map((t: Partial<DigestTodo> & { text: string }) => ({
          ...blankTodo(t.text),
          ownerId: t.ownerId ?? null,
          projectId: t.projectId ?? null,
          ownerRaw: t.ownerRaw ?? null,
          projectRaw: t.projectRaw ?? null,
          heardOwner: t.ownerRaw ?? null,
          heardProject: t.projectRaw ?? null,
          existingCardId: t.existingCardId ?? null,
          dueDate: t.dueDate ?? null,
        }))
      );
      setWarnings(data.warnings ?? []);
      setStep("edit");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  function updateSection(id: string, content: string) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, content } : s)));
  }

  function addTodo() {
    if (!newTodo.trim()) return;
    setTodos((prev) => [...prev, blankTodo(newTodo.trim())]);
    setNewTodo("");
  }

  function removeTodo(index: number) {
    setTodos((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTodo(index: number, text: string) {
    setTodos((prev) => prev.map((t, i) => (i === index ? { ...t, text } : t)));
  }

  function patchTodo(index: number, patch: Partial<DigestTodo>) {
    setTodos((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekOf,
          title,
          sections: sections.map((s) => ({
            ...s,
            content: plainToDigestHtml(s.content),
          })),
          todos: todos.map((t) => ({
            text: t.text,
            ownerId: t.ownerId,
            projectId: t.projectId,
            ownerRaw: t.ownerRaw,
            projectRaw: t.projectRaw,
            needsReview: unresolved(t),
            existingCardId: t.existingCardId,
            dueDate: t.dueDate,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Save failed");
      }
      const digest = await res.json();
      router.push(`/admin/digest/${digest.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/digest"
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All digests
          </Link>
          <h1 className="text-xl font-bold text-foreground">New Weekly Digest</h1>
        </div>
      </div>

      {step === "paste" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="label mb-1.5 block">Meeting notes or Granola links</label>
              <p className="mb-3 text-xs text-muted-foreground">
                Paste Granola share links (one per line), raw meeting notes, or a mix of both. Claude will fetch and structure everything into the digest.
              </p>
              <textarea
                className="input-field min-h-[320px] w-full resize-y font-mono text-sm"
                placeholder={`https://notes.granola.ai/t/...\nhttps://notes.granola.ai/t/...\n\nOr paste raw notes here…`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {generateError && (
              <p className="text-sm text-destructive">{generateError}</p>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleGenerate}
                disabled={generating || !notes.trim()}
                className="flex items-center gap-2"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generating ? "Generating…" : "Generate Digest"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "edit" && (
        <div className="space-y-5">
          {warnings.length > 0 && (
            <div className="rounded-md border border-ochre/40 bg-ochre/10 px-4 py-3 text-sm text-foreground">
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
          {/* Title + week */}
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1">
                <label className="label">Title</label>
                <input
                  className="input-field w-full"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="label">Week of</label>
                <input
                  type="date"
                  className="input-field"
                  value={weekOf}
                  onChange={(e) => setWeekOf(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Sections */}
          {sections.map((section) => (
            <Card key={section.id}>
              <CardContent className="pt-5">
                <label className="label mb-2 block">{section.heading}</label>
                <textarea
                  className="input-field min-h-[120px] w-full resize-y text-sm"
                  placeholder={`Write something about ${section.heading.toLowerCase()}…`}
                  value={section.content}
                  onChange={(e) => updateSection(section.id, e.target.value)}
                />
              </CardContent>
            </Card>
          ))}

          {/* Todos */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <label className="label block">This Week&apos;s Todos</label>

              {todos.length > 0 && (
                <ul className="space-y-2">
                  {todos.map((todo, i) => (
                    <li key={i} className="space-y-1.5 border-b border-border pb-2 last:border-0">
                      <div className="flex items-center gap-2">
                        {unresolved(todo) && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-ochre"
                            title="Needs review"
                            aria-label="Needs review"
                          />
                        )}
                        <input
                          className="input-field flex-1 text-sm"
                          value={todo.text}
                          onChange={(e) => updateTodo(i, e.target.value)}
                        />
                        <button
                          onClick={() => removeTodo(i)}
                          aria-label="Remove todo"
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-4">
                        <select
                          aria-label="Owner"
                          className="input-field w-full text-xs sm:w-auto sm:min-w-40"
                          value={todo.ownerId ?? ""}
                          onChange={(e) => patchTodo(i, { ownerId: e.target.value || null, ownerRaw: null })}
                        >
                          <option value="">No owner</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </select>
                        <select
                          aria-label="Project"
                          className="input-field w-full text-xs sm:w-auto sm:min-w-40"
                          value={todo.projectId ?? ""}
                          onChange={(e) => patchTodo(i, { projectId: e.target.value || null, projectRaw: null })}
                        >
                          <option value="">No project</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </select>
                        {todo.heardOwner && (
                          <span className="text-xs text-muted-foreground">heard as &lsquo;{todo.heardOwner}&rsquo;</span>
                        )}
                        {todo.heardProject && (
                          <span className="text-xs text-muted-foreground">project heard as &lsquo;{todo.heardProject}&rsquo;</span>
                        )}
                        {todo.existingCardId && (
                          <span className="text-xs text-muted-foreground">already on the board</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {carriedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Plus {carriedCount} open item{carriedCount === 1 ? "" : "s"} already on the board will be carried into this digest.
                </p>
              )}

              <div className="flex gap-2">
                <input
                  className="input-field flex-1 text-sm"
                  placeholder="Add a todo…"
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTodo()}
                />
                <Button size="sm" variant="secondary" onClick={addTodo} disabled={!newTodo.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {saveError && (
            <p className="text-sm text-destructive">{saveError}</p>
          )}

          <div className="flex items-center justify-between gap-4 pb-8">
            <Button variant="secondary" onClick={() => setStep("paste")}>
              ← Back to notes
            </Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save Draft"}
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
