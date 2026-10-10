"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ADMIN_EMAIL_DOMAINS_LABEL } from "@/lib/org";
import type { BoardPersonData, BoardProjectData } from "./types";
import { TableSkeleton } from "@/components/ui/skeleton";

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
  const [deleting, setDeleting] = useState<{ kind: "person" | "project"; id: string; name: string; cards: number } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const url =
      deleting.kind === "person"
        ? `/api/admin/board/people/${deleting.id}`
        : `/api/admin/board/projects/${deleting.id}`;
    const ok = await call(url, "DELETE");
    setDeleteBusy(false);
    if (ok) setDeleting(null);
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

  if (loading) return <TableSkeleton rows={4} cols={3} className="my-6" />;

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
      {error && <p className="text-xs text-tone-clay-ink">{error}</p>}

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">People</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Molly admins appear automatically the first time they sign in with their {ADMIN_EMAIL_DOMAINS_LABEL} Google
            account. To assign work to someone without a Molly login, add their name below; they can own cards but
            don&apos;t get a login or emails.
          </p>
          <label htmlFor="new-person-name" className="mb-1 block text-xs font-medium text-foreground">
            Add someone without a Molly login
          </label>
          <div className="mb-3 flex flex-wrap gap-2">
            <Input
              id="new-person-name"
              placeholder="Name"
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
                    {!p.userId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setDeleting({ kind: "person", id: p.id, name: p.displayName, cards: p.cardCount ?? 0 })}
                      >
                        Delete
                      </Button>
                    )}
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDeleting({ kind: "project", id: p.id, name: p.name, cards: p.cardCount ?? 0 })}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {projects.length === 0 && <li className="p-3 text-xs text-muted-foreground">No projects yet.</li>}
          </ul>
        </section>
      </div>

      {deleting && (
        <Dialog open onOpenChange={(o) => !o && !deleteBusy && setDeleting(null)}>
          <DialogContent title={`Delete ${deleting.name}?`} size="sm">
            <DialogBody className="space-y-2 text-sm text-foreground">
              <span className="block">
                {deleting.cards === 0
                  ? "No cards use this " + (deleting.kind === "person" ? "person" : "project") + "."
                  : `${deleting.cards} card${deleting.cards === 1 ? "" : "s"} will become ${
                      deleting.kind === "person" ? "unassigned" : "unassigned from this project"
                    }.`}
              </span>
              <span className="block">
                Saved name corrections for {deleting.name} will be removed. This can&apos;t be undone.
              </span>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
                {deleteBusy ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
