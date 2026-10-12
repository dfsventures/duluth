"use client";

import { useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
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
const IGNORE = "__ignore__";

// Route contract (WS114.4): POST …/cards/[id]/resolve { owners: [{ raw, personId | newPerson | ignore }], projectId?, newProjectName?, rememberAlias } -> { card, fixed }.
export function ResolveDialog({ card, people, projects, onClose, onApplied, onResolved }: Props) {
  const [ownerChoices, setOwnerChoices] = useState<Record<string, string>>({});
  const [projectChoice, setProjectChoice] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fixed, setFixed] = useState<number | null>(null);

  const rawOwners = card.unmatchedOwnerNames;
  // An alias-matched project keeps its heard text but needs no decision (F117).
  const rawProject = card.projectId ? null : card.rawProjectName;
  const ready =
    rawOwners.every((n) => !!ownerChoices[n]) &&
    (rawProject ? !!projectChoice : true) &&
    (rawOwners.length > 0 || !!rawProject);
  const remembered = [...rawOwners.filter((n) => ownerChoices[n] !== IGNORE), ...(rawProject ? [rawProject] : [])];

  async function submit() {
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = { rememberAlias: remember };
    if (rawOwners.length) {
      body.owners = rawOwners.map((raw) => {
        const choice = ownerChoices[raw];
        if (choice === NEW) return { raw, newPerson: true };
        if (choice === IGNORE) return { raw, ignore: true };
        return { raw, personId: choice };
      });
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
    <Dialog open onOpenChange={(o) => !o && (fixed !== null ? onResolved() : onClose())}>
      <DialogContent title="Resolve names" description="Match unrecognised names to the board" size="sm">
          {fixed === null ? (
            <>
              <DialogBody className="space-y-4">
                <p className="text-sm text-foreground break-words">{card.title}</p>
                {rawOwners.map((name, i) => (
                  <Select
                    key={name}
                    id={`rs-owner-${i}`}
                    label={`Molly heard '${name}' as an owner`}
                    value={ownerChoices[name] ?? ""}
                    onChange={(e) => setOwnerChoices((c) => ({ ...c, [name]: e.target.value }))}
                  >
                    <option value="">Choose a person…</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    <option value={NEW}>{`Add '${name}' as a new person`}</option>
                    <option value={IGNORE}>Not an owner — ignore</option>
                  </Select>
                ))}
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
                    checked={remember && remembered.length > 0}
                    disabled={remembered.length === 0}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded-sm border-input"
                  />
                  {remembered.length > 0
                    ? `Remember ${remembered.map((s) => `'${s}'`).join(" and ")} next time`
                    : "Nothing to remember"}
                </label>
                {error && <p className="text-xs text-tone-clay-ink">{error}</p>}
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={busy || !ready}>
                  {busy ? "Saving..." : "Resolve"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogBody className="text-sm text-foreground">
                Resolved.{fixed > 0 && ` Also fixed ${fixed} other item${fixed === 1 ? "" : "s"}.`}
              </DialogBody>
              <DialogFooter>
                <Button onClick={onResolved}>Done</Button>
              </DialogFooter>
            </>
          )}
      </DialogContent>
    </Dialog>
  );
}
