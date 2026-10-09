"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { BOARD_STATUSES, BOARD_STATUS_LABELS, MAX_NOTES_LENGTH, MAX_TITLE_LENGTH, type BoardStatus } from "@/lib/board";
import type { BoardCardData, BoardPersonData, BoardProjectData } from "./types";

interface Props {
  /** null = create mode. */
  card: BoardCardData | null;
  people: BoardPersonData[];
  projects: BoardProjectData[];
  defaultOwnerId?: string | null;
  onClose: () => void;
  /** Receives the saved card (when the API returned one) so the board can update instantly. */
  onSaved: (card?: BoardCardData) => void;
  /** PATCH persisted but the follow-up status move failed. */
  onPartialFailure?: (message: string) => void;
}

async function readError(res: Response, fallback: string) {
  const d = await res.json().catch(() => null);
  return d?.error ?? fallback;
}

// Notes are plain text: a <textarea> value, never rendered as HTML.
export function CardDialog({ card, people, projects, defaultOwnerId, onClose, onSaved, onPartialFailure }: Props) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [notes, setNotes] = useState(card?.notes ?? "");
  const [ownerId, setOwnerId] = useState(card?.ownerId ?? defaultOwnerId ?? "");
  const [projectId, setProjectId] = useState(card?.projectId ?? "");
  const [dueDate, setDueDate] = useState(card?.dueDate ? card.dueDate.slice(0, 10) : "");
  const [status, setStatus] = useState<BoardStatus>(card?.status ?? "TODO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setBusy(true);
    setError("");
    let result: BoardCardData | undefined;
    try {
      if (!card) {
        const res = await fetch("/api/admin/board/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            notes: notes || null,
            status,
            ownerId: ownerId || null,
            projectId: projectId || null,
            ...(dueDate ? { dueDate } : {}),
          }),
        });
        if (!res.ok) throw new Error(await readError(res, "Failed to create the item."));
        result = await res.json().catch(() => undefined);
      } else {
        const res = await fetch(`/api/admin/board/cards/${card.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            notes: notes || null,
            ownerId: ownerId || null,
            projectId: projectId || null,
            dueDate: dueDate || null,
          }),
        });
        if (!res.ok) throw new Error(await readError(res, "Failed to save the item."));
        const saved: BoardCardData | undefined = await res.json().catch(() => undefined);
        result = saved;
        if (status !== card.status) {
          const mv = await fetch(`/api/admin/board/cards/${card.id}/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          if (!mv.ok) {
            // The edit persisted: refresh the board with it, close, and surface the move failure there.
            onPartialFailure?.(`Saved, but moving the item failed: ${await readError(mv, "please try again")}`);
            onSaved(saved);
            return;
          }
          result = saved ? { ...saved, status } : saved;
        }
      }
      onSaved(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!card || !window.confirm("Archive this item? It will leave the board.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/board/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to archive."));
      const archived: BoardCardData | undefined = await res.json().catch(() => undefined);
      onSaved(archived);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sm border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <Dialog.Title className="font-semibold text-foreground">
              {card ? "Edit item" : "Add item"}
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Team board item details</Dialog.Description>
          <div className="space-y-4 px-6 py-5">
            <Input
              id="bc-title"
              label="Title"
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              id="bc-notes"
              label="Notes (plain text)"
              value={notes}
              maxLength={MAX_NOTES_LENGTH}
              onChange={(e) => setNotes(e.target.value)}
              className="whitespace-pre-wrap"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select id="bc-owner" label="Owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Select id="bc-project" label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input id="bc-due" label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <Select id="bc-status" label="Status" value={status} onChange={(e) => setStatus(e.target.value as BoardStatus)}>
                {BOARD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {BOARD_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            {error && <p className="text-xs text-laterite">{error}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4">
            <div>
              {card && (
                <Button variant="destructive" size="sm" onClick={archive} disabled={busy}>
                  Archive
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving..." : card ? "Save" : "Add item"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
