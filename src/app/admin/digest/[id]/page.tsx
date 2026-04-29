"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Send, CheckCircle2, Clock, AlertCircle,
  Loader2, Pencil, Trash2, X, Plus, Save,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface DigestSection {
  id: string;
  heading: string;
  content: string;
}

interface DigestTodo {
  id: string;
  text: string;
  completed: boolean;
  assignee: { id: string; name: string | null; email: string } | null;
}

interface Digest {
  id: string;
  title: string;
  weekOf: string;
  sections: DigestSection[];
  sentAt: string | null;
  createdAt: string;
  todos: DigestTodo[];
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export default function DigestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editWeekOf, setEditWeekOf] = useState("");
  const [editSections, setEditSections] = useState<DigestSection[]>([]);
  const [editTodos, setEditTodos] = useState<{ text: string }[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Send / delete state
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/digest/${id}`)
      .then((r) => r.json())
      .then(setDigest)
      .finally(() => setLoading(false));
  }, [id]);

  function startEditing() {
    if (!digest) return;
    setEditTitle(digest.title);
    setEditWeekOf(new Date(digest.weekOf).toISOString().slice(0, 10));
    setEditSections(digest.sections.map((s) => ({ ...s })));
    setEditTodos(digest.todos.map((t) => ({ text: t.text })));
    setSaveError(null);
    setEditing(true);
  }

  function updateSection(sectionId: string, content: string) {
    setEditSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, content } : s)));
  }

  function addTodo() {
    if (!newTodo.trim()) return;
    setEditTodos((prev) => [...prev, { text: newTodo.trim() }]);
    setNewTodo("");
  }

  function removeTodo(index: number) {
    setEditTodos((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTodo(index: number, text: string) {
    setEditTodos((prev) => prev.map((t, i) => (i === index ? { text } : t)));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/digest/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          weekOf: editWeekOf,
          sections: editSections.map((s) => ({
            ...s,
            content: s.content
              .split("\n\n")
              .filter(Boolean)
              .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
              .join(""),
          })),
          todos: editTodos,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Save failed");
      }
      const updated = await res.json();
      setDigest(updated);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/digest/${id}/send`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to send");
      }
      const data = await res.json();
      setDigest((d) => (d ? { ...d, sentAt: data.sentAt } : d));
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/digest/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/digest");
      }
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function toggleTodo(todoId: string, completed: boolean) {
    const res = await fetch(`/api/admin/digest/${id}/todos/${todoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (res.ok) {
      setDigest((d) =>
        d ? { ...d, todos: d.todos.map((t) => (t.id === todoId ? { ...t, completed } : t)) } : d
      );
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (!digest) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">Digest not found</p>
          <Link href="/admin/digest">
            <Button variant="secondary" size="sm" className="mt-4">Back to digests</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const sentAgeMs = digest.sentAt ? Date.now() - new Date(digest.sentAt).getTime() : null;
  const isDraft = !digest.sentAt;
  const isEditWindow = isDraft || (sentAgeMs !== null && sentAgeMs < TWELVE_HOURS_MS);
  const editHoursLeft = sentAgeMs !== null ? Math.max(0, Math.ceil((TWELVE_HOURS_MS - sentAgeMs) / 3_600_000)) : null;
  const sections = editing ? editSections : (digest.sections as DigestSection[]);

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/digest"
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All digests
          </Link>
          {editing ? (
            <input
              className="input-field w-full text-xl font-bold"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          ) : (
            <h1 className="text-xl font-bold text-foreground">{digest.title}</h1>
          )}
          {editing ? (
            <input
              type="date"
              className="input-field mt-1 text-sm"
              value={editWeekOf}
              onChange={(e) => setEditWeekOf(e.target.value)}
            />
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Week of {formatDate(digest.weekOf)}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {digest.sentAt ? (
            <Badge variant="success" className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Sent {formatDate(digest.sentAt)}
            </Badge>
          ) : (
            <Badge variant="warning" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Draft
            </Badge>
          )}

          {editing ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <>
              {isEditWindow && (
                <Button variant="secondary" size="sm" onClick={startEditing} className="flex items-center gap-1.5">
                  <Pencil className="h-4 w-4" />
                  Edit
                  {editHoursLeft !== null && (
                    <span className="text-xs text-muted-foreground ml-1">({editHoursLeft}h left)</span>
                  )}
                </Button>
              )}
              {isDraft && !confirmDelete && (
                <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
              {isDraft && confirmDelete && (
                <>
                  <span className="text-xs text-muted-foreground">Are you sure?</span>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
                  </Button>
                </>
              )}
              {isEditWindow && (
                <Button onClick={handleSend} disabled={sending} size="sm" className="flex items-center gap-1.5">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? "Sending…" : digest.sentAt ? "Resend" : "Send to team"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {(sendError || saveError) && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sendError ?? saveError}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-6">
        {sections.filter((s) => editing || s.content?.trim()).map((section) => (
          <Card key={section.id}>
            <CardContent className="pt-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground border-b border-border pb-2">
                {section.heading}
              </h2>
              {editing ? (
                <textarea
                  className="input-field min-h-[120px] w-full resize-y text-sm"
                  value={section.content}
                  onChange={(e) => updateSection(section.id, e.target.value)}
                  placeholder={`Write something about ${section.heading.toLowerCase()}…`}
                />
              ) : (
                <div
                  className="prose prose-sm max-w-none text-foreground dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
              )}
            </CardContent>
          </Card>
        ))}

        {/* Todos */}
        {(editing || digest.todos.length > 0) && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground border-b border-border pb-2">
                This Week's Todos
              </h2>

              {editing ? (
                <div className="space-y-3">
                  {editTodos.length > 0 && (
                    <ul className="space-y-2">
                      {editTodos.map((todo, i) => (
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
                </div>
              ) : (
                <ul className="space-y-2">
                  {digest.todos.map((todo) => (
                    <li key={todo.id} className="flex items-start gap-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={(e) => toggleTodo(todo.id, e.target.checked)}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${todo.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {todo.text}
                        </span>
                        {todo.assignee && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            — {todo.assignee.name ?? todo.assignee.email}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
