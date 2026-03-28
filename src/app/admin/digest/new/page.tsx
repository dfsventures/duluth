"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, Plus, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface DigestSection {
  id: string;
  heading: string;
  content: string;
}

interface DigestTodo {
  text: string;
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
      setTodos(data.todos);
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
    setTodos((prev) => [...prev, { text: newTodo.trim() }]);
    setNewTodo("");
  }

  function removeTodo(index: number) {
    setTodos((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTodo(index: number, text: string) {
    setTodos((prev) => prev.map((t, i) => (i === index ? { text } : t)));
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
            content: s.content
              .split("\n\n")
              .filter(Boolean)
              .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
              .join(""),
          })),
          todos,
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
              <label className="label mb-1.5 block">Paste meeting notes</label>
              <p className="mb-3 text-xs text-muted-foreground">
                Copy notes from Granola (or anywhere) and paste them here. Claude will structure them into the digest.
              </p>
              <textarea
                className="input-field min-h-[320px] w-full resize-y font-mono text-sm"
                placeholder="Paste your meeting notes here…"
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
              <label className="label block">This Week's Todos</label>

              {todos.length > 0 && (
                <ul className="space-y-2">
                  {todos.map((todo, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <input
                        className="input-field flex-1 text-sm"
                        value={todo.text}
                        onChange={(e) => updateTodo(i, e.target.value)}
                      />
                      <button
                        onClick={() => removeTodo(i)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
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
