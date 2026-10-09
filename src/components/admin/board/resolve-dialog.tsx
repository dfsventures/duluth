"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { BoardCardData, BoardPersonData, BoardProjectData } from "./types";

interface Props {
  card: BoardCardData;
  people: BoardPersonData[];
  projects: BoardProjectData[];
  onClose: () => void;
  /** Fires as soon as the server confirms, before the "Resolved." screen is dismissed. */
  onApplied?: (card: BoardCardData | null) => void;
  onResolved: () => void;
}

const NEW = "__new__";

// Route contract (WS106): POST …/cards/[id]/resolve -> { card, fixed }.
export function ResolveDialog({ card, people, projects, onClose, onApplied, onResolved }: Props) {
  const [ownerChoice, setOwnerChoice] = useState("");
  const [projectChoice, setProjectChoice] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fixed, setFixed] = useState<number | null>(null);

  const rawOwner = card.rawOwnerName;
  const rawProject = card.rawProjectName;
  const ready = (rawOwner ? !!ownerChoice : true) && (rawProject ? !!projectChoice : true) && (!!rawOwner || !!rawProject);

  async function submit() {
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = { rememberAlias: remember };
    if (rawOwner) {
      if (ownerChoice === NEW) body.newPersonName = rawOwner;
      else body.ownerId = ownerChoice;
    }
    if (rawProject) {
      if (projectChoice === NEW) body.newProjectName = rawProject;
      else body.projectId = projectChoice;
    }
    try {
      const res = await fetch(`/api/admin/board/cards/${card.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? "Failed to resolve.");
      onApplied?.((d?.card as BoardCardData | undefined) ?? null);
      setFixed(typeof d?.fixed === "number" ? d.fixed : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && (fixed !== null ? onResolved() : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sm border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <Dialog.Title className="font-semibold text-foreground">Resolve names</Dialog.Title>
            <Dialog.Close className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Match unrecognised names to the board</Dialog.Description>
          {fixed === null ? (
            <>
              <div className="space-y-4 px-6 py-5">
                <p className="text-sm text-foreground break-words">{card.title}</p>
                {rawOwner && (
                  <Select
                    id="rs-owner"
                    label={`Molly heard '${rawOwner}' as owner`}
                    value={ownerChoice}
                    onChange={(e) => setOwnerChoice(e.target.value)}
                  >
                    <option value="">Choose a person…</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    <option value={NEW}>{`Add '${rawOwner}' as a new person`}</option>
                  </Select>
                )}
                {rawProject && (
                  <Select
                    id="rs-project"
                    label={`Molly heard '${rawProject}' as project`}
                    value={projectChoice}
                    onChange={(e) => setProjectChoice(e.target.value)}
                  >
                    <option value="">Choose a project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value={NEW}>{`Add '${rawProject}' as a new project`}</option>
                  </Select>
                )}
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded-sm border-input"
                  />
                  Remember {[rawOwner, rawProject].filter(Boolean).map((s) => `'${s}'`).join(" and ")} next time
                </label>
                {error && <p className="text-xs text-laterite">{error}</p>}
              </div>
              <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                <Button variant="secondary" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={busy || !ready}>
                  {busy ? "Saving..." : "Resolve"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="px-6 py-5 text-sm text-foreground">
                Resolved.{fixed > 0 && ` Also fixed ${fixed} other item${fixed === 1 ? "" : "s"}.`}
              </div>
              <div className="flex justify-end border-t border-border px-6 py-4">
                <Button onClick={onResolved}>Done</Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
