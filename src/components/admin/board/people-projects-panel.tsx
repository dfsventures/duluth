"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { BoardPersonData, BoardProjectData } from "./types";

interface ImportItem {
  todoId: string;
  title: string;
  ownerLabel: string | null;
  rawOwnerName: string | null;
  needsReview: boolean;
}
interface ImportPreview {
  digest: { id: string; title: string } | null;
  items: ImportItem[];
  skipped: number;
}

async function readError(res: Response, fallback: string) {
  const d = await res.json().catch(() => null);
  return d?.error ?? fallback;
}

type Aliases = { id: string; normalized: string }[] | undefined;

export function PeopleProjectsPanel({ onChanged }: { onChanged: () => void }) {
  const [people, setPeople] = useState<BoardPersonData[]>([]);
  const [projects, setProjects] = useState<BoardProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [newProject, setNewProject] = useState("");
  const [editing, setEditing] = useState<{ kind: "person" | "project"; id: string; value: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pr, jr] = await Promise.all([fetch("/api/admin/board/people"), fetch("/api/admin/board/projects")]);
      if (!pr.ok || !jr.ok) throw new Error("Failed to load people and projects.");
      setPeople(await pr.json());
      setProjects(await jr.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function call(url: string, method: string, body?: unknown) {
    setError("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await readError(res, "Request failed."));
      return false;
    }
    await load();
    onChanged();
    return true;
  }

  async function addPerson() {
    if (!newPerson.trim()) return;
    if (await call("/api/admin/board/people", "POST", { displayName: newPerson.trim() })) setNewPerson("");
  }
  async function addProject() {
    if (!newProject.trim()) return;
    if (await call("/api/admin/board/projects", "POST", { name: newProject.trim() })) setNewProject("");
  }
  async function saveRename() {
    if (!editing) return;
    const ok =
      editing.kind === "person"
        ? await call(`/api/admin/board/people/${editing.id}`, "PATCH", { displayName: editing.value })
        : await call(`/api/admin/board/projects/${editing.id}`, "PATCH", { name: editing.value });
    if (ok) setEditing(null);
  }

  async function openImport() {
    setImportMsg("");
    setImportBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/board/import-latest-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to preview the import."));
      setPreview(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setImportBusy(false);
    }
  }
  async function confirmImport() {
    setImportBusy(true);
    try {
      const res = await fetch("/api/admin/board/import-latest-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      if (!res.ok) throw new Error(await readError(res, "Import failed."));
      const d = await res.json();
      setImportMsg(`Imported ${d.created} item${d.created === 1 ? "" : "s"} onto the board.`);
      setPreview(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setImportBusy(false);
    }
  }

  const aliasChips = (aliases: Aliases) =>
    (aliases ?? []).map((a) => (
      <span
        key={a.id}
        className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
      >
        {a.normalized}
        <button
          type="button"
          aria-label={`Remove alias ${a.normalized}`}
          onClick={() => call(`/api/admin/board/aliases/${a.id}`, "DELETE")}
          className="hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    ));

  if (loading) return <p className="py-8 text-sm text-muted-foreground">Loading...</p>;

  const renameForm = (kind: "person" | "project", id: string) =>
    editing && editing.kind === kind && editing.id === id ? (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="New name"
          value={editing.value}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          className="h-8 w-48"
        />
        <Button size="sm" onClick={saveRename}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
          Cancel
        </Button>
      </div>
    ) : null;

  return (
    <div className="space-y-8">
      {error && <p className="text-xs text-laterite">{error}</p>}

      <section className="rounded-sm border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-48 flex-1">
            <h3 className="text-sm font-semibold text-foreground">Import open items from the latest digest</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              One-time: turns the open to-dos of the most recent digest into board cards. Safe to run again; it never
              creates duplicates.
            </p>
            {importMsg && <p className="mt-2 text-xs text-acacia">{importMsg}</p>}
          </div>
          <Button variant="secondary" className="shrink-0" onClick={openImport} disabled={importBusy}>
            Preview import
          </Button>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">People</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            <Input
              aria-label="New person name"
              placeholder="Add a person (no login needed)"
              value={newPerson}
              onChange={(e) => setNewPerson(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPerson()}
              className="min-w-48 flex-1"
            />
            <Button onClick={addPerson} className="shrink-0">
              Add
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-sm border border-border bg-card">
            {people.map((p) => (
              <li key={p.id} className={`p-3 ${p.archivedAt ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-48 flex-1">
                    <p className="text-sm text-foreground">
                      {p.label} {p.userId && <Badge variant="info">Molly admin</Badge>}{" "}
                      {p.archivedAt && <Badge variant="neutral">Archived</Badge>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">{aliasChips(p.aliases)}</div>
                    <div className="mt-2">{renameForm("person", p.id)}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!p.userId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditing({ kind: "person", id: p.id, value: p.displayName })}
                      >
                        Rename
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => call(`/api/admin/board/people/${p.id}`, "PATCH", { archived: !p.archivedAt })}
                    >
                      {p.archivedAt ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {people.length === 0 && <li className="p-3 text-xs text-muted-foreground">No people yet.</li>}
          </ul>
        </section>

        <section>
          <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">Projects</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            <Input
              aria-label="New project name"
              placeholder="Add a project"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addProject()}
              className="min-w-48 flex-1"
            />
            <Button onClick={addProject} className="shrink-0">
              Add
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-sm border border-border bg-card">
            {projects.map((p) => (
              <li key={p.id} className={`p-3 ${p.archivedAt ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-48 flex-1">
                    <p className="text-sm text-foreground">
                      {p.name} {p.archivedAt && <Badge variant="neutral">Archived</Badge>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">{aliasChips(p.aliases)}</div>
                    <div className="mt-2">{renameForm("project", p.id)}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing({ kind: "project", id: p.id, value: p.name })}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => call(`/api/admin/board/projects/${p.id}`, "PATCH", { archived: !p.archivedAt })}
                    >
                      {p.archivedAt ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {projects.length === 0 && <li className="p-3 text-xs text-muted-foreground">No projects yet.</li>}
          </ul>
        </section>
      </div>

      {preview && (
        <Dialog.Root open onOpenChange={(o) => !o && setPreview(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sm border border-border bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <Dialog.Title className="font-semibold text-foreground">Import preview</Dialog.Title>
                <Dialog.Close className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">Open to-dos that would be added to the board</Dialog.Description>
              <div className="space-y-3 px-6 py-5">
                {!preview.digest ? (
                  <p className="text-sm text-muted-foreground">There are no digests to import from.</p>
                ) : preview.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing to import from “{preview.digest.title}”: no open to-dos left that are not already on the
                    board.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-foreground">
                      {preview.items.length} item{preview.items.length === 1 ? "" : "s"} from “{preview.digest.title}”
                      will be added to To do.
                    </p>
                    <ul className="space-y-2">
                      {preview.items.map((i) => (
                        <li key={i.todoId} className="rounded-sm border border-border p-2 text-sm">
                          <p className="break-words text-foreground">{i.title}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {i.ownerLabel ?? "Unassigned"}
                            {i.needsReview && (
                              <span className="ml-2 text-ochre">needs review: heard as &apos;{i.rawOwnerName}&apos;</span>
                            )}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                <Button variant="secondary" onClick={() => setPreview(null)}>
                  Close
                </Button>
                {preview.items.length > 0 && (
                  <Button onClick={confirmImport} disabled={importBusy}>
                    {importBusy ? "Importing..." : `Import ${preview.items.length}`}
                  </Button>
                )}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
