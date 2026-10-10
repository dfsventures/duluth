"use client";

import { useState } from "react";
import { ExternalLink, History, NotebookPen, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RichEditor } from "@/components/ui/rich-editor";
import type { FlashMessage } from "@/lib/use-flash-message";
import type { Note } from "./types";
import { NoteHistoryDialog } from "./note-history-dialog";

export function NotesTab({
  companyId,
  notes,
  setNotes,
  setMessage,
}: {
  companyId: string;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  setMessage: (m: FlashMessage | null) => void;
}) {
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteForm, setNoteForm] = useState({ title: "", body: "", occurredAt: "", transcriptUrl: "" });
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [historyNote, setHistoryNote] = useState<Note | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Notes</h3>
        {!showNoteForm && !editingNote && (
          <Button
            size="sm"
            onClick={() => {
              setNoteForm({ title: "", body: "", occurredAt: new Date().toISOString().split("T")[0], transcriptUrl: "" });
              setShowNoteForm(true);
            }}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Note
          </Button>
        )}
      </div>

      {/* Create / Edit form */}
      {(showNoteForm || editingNote) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              {editingNote ? "Edit Note" : "New Note"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={noteForm.title}
                  onChange={(e) => setNoteForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Q1 check-in call"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date of event</label>
                <input
                  type="date"
                  value={noteForm.occurredAt}
                  onChange={(e) => setNoteForm((p) => ({ ...p, occurredAt: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Transcript / Recording URL <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input
                type="url"
                value={noteForm.transcriptUrl}
                onChange={(e) => setNoteForm((p) => ({ ...p, transcriptUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <RichEditor
                value={noteForm.body}
                onChange={(val) => setNoteForm((p) => ({ ...p, body: val }))}
                placeholder="Add your call notes here..."
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={savingNote}
                onClick={async () => {
                  setSavingNote(true);
                  try {
                    const url = editingNote
                      ? `/api/companies/${companyId}/notes/${editingNote.id}`
                      : `/api/companies/${companyId}/notes`;
                    const res = await fetch(url, {
                      method: editingNote ? "PATCH" : "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(noteForm),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error ?? "Failed to save note");
                    if (editingNote) {
                      setNotes((prev) => prev.map((n) => n.id === data.id ? data : n));
                      setEditingNote(null);
                    } else {
                      setNotes((prev) => [data, ...prev]);
                      setShowNoteForm(false);
                    }
                    setMessage({ type: "success", text: "Note saved." });
                  } catch (err) {
                    setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save note." });
                  } finally {
                    setSavingNote(false);
                  }
                }}
              >
                <Save className="mr-2 h-3.5 w-3.5" />
                {savingNote ? "Saving..." : "Save Note"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { setShowNoteForm(false); setEditingNote(null); }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes list */}
      {notes.length === 0 && !showNoteForm ? (
        <EmptyState
          icon={<NotebookPen className="h-8 w-8" />}
          title="No notes yet"
          description="Add call notes, meeting summaries, or any admin observations about this company."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setNoteForm({ title: "", body: "", occurredAt: new Date().toISOString().split("T")[0], transcriptUrl: "" });
                setShowNoteForm(true);
              }}
            >
              Add First Note
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="py-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-48 flex-1">
                    <p className="font-semibold">{note.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(note.occurredAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                      {" · "}Added by {note.createdBy.name ?? note.createdBy.email}
                      {note._count.revisions > 1 && (
                        <> · <span className="text-muted-foreground">{note._count.revisions} revisions</span></>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {note.transcriptUrl && (
                      <a
                        href={note.transcriptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary-50"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Transcript
                      </a>
                    )}
                    <button
                      onClick={() => setHistoryNote(note)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="View history"
                    >
                      <History className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingNote(note);
                        setNoteForm({
                          title: note.title,
                          body: note.body,
                          occurredAt: new Date(note.occurredAt).toISOString().split("T")[0],
                          transcriptUrl: note.transcriptUrl ?? "",
                        });
                        setShowNoteForm(false);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit note"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      disabled={deletingNoteId === note.id}
                      onClick={async () => {
                        setDeletingNoteId(note.id);
                        try {
                          const res = await fetch(`/api/companies/${companyId}/notes/${note.id}`, { method: "DELETE" });
                          if (!res.ok) throw new Error("Failed to delete note");
                          setNotes((prev) => prev.filter((n) => n.id !== note.id));
                        } catch {
                          setMessage({ type: "error", text: "Failed to delete note." });
                        } finally {
                          setDeletingNoteId(null);
                        }
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                      title="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div
                  className="prose prose-sm max-w-none text-foreground line-clamp-4"
                  dangerouslySetInnerHTML={{ __html: note.body }}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {historyNote && (
        <NoteHistoryDialog companyId={companyId} note={historyNote} onClose={() => setHistoryNote(null)} />
      )}
    </div>
  );
}
