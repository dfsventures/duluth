"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { ownerLabel, readError, type RevisionView } from "./types";

/**
 * One section's edit history: who, when, "via Marge", a word diff against the current text, and Restore.
 * Restore writes a NEW version holding the old copy (nothing is rewritten), guarded by the version
 * the user is looking at.
 */
export function HistoryDialog({
  memoId,
  sectionKey,
  sectionTitle,
  currentMarkdown,
  currentVersion,
  canEdit,
  onClose,
  onRestored,
}: {
  memoId: string;
  sectionKey: string;
  sectionTitle: string;
  currentMarkdown: string;
  currentVersion: number;
  canEdit: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [revisions, setRevisions] = useState<RevisionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RevisionView | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/memos/${memoId}/sections/${sectionKey}/revisions`);
        if (!res.ok) throw new Error(await readError(res, "Couldn't load the history."));
        if (!cancelled) setRevisions(await res.json());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memoId, sectionKey]);

  async function restore(rev: RevisionView) {
    setRestoring(true);
    try {
      const res = await fetch(`/api/admin/memos/${memoId}/sections/${sectionKey}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromVersion: rev.version, expectedVersion: currentVersion }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't restore that version."));
      toast.success(`Restored version ${rev.version}.`);
      onRestored();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't restore that version.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={sectionTitle} description="Version history" size="lg">
        <DialogBody>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading history...</p>
          ) : error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : selected ? (
            <Compare
              rev={selected}
              currentMarkdown={currentMarkdown}
              canRestore={canEdit && selected.version !== currentVersion}
              restoring={restoring}
              onBack={() => setSelected(null)}
              onRestore={() => restore(selected)}
            />
          ) : (
            <ol className="space-y-2">
              {revisions.map((r) => (
                <li key={r.version} className="flex items-center justify-between gap-3 border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Version {r.version}
                      {r.version === currentVersion && <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ownerLabel(r.editedBy)} · {new Date(r.createdAt).toLocaleString()}
                      {r.via === "marge" && " · via Marge"}
                      {r.via === "notion" && " · imported from Notion"}
                      {r.restoredFrom !== null && ` · restored from version ${r.restoredFrom}`}
                    </p>
                  </div>
                  {r.version !== currentVersion && (
                    <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>
                      Compare
                    </Button>
                  )}
                </li>
              ))}
              {revisions.length === 0 && <li className="text-sm text-muted-foreground">No history yet.</li>}
            </ol>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Compare({
  rev,
  currentMarkdown,
  canRestore,
  restoring,
  onBack,
  onRestore,
}: {
  rev: RevisionView;
  currentMarkdown: string;
  canRestore: boolean;
  restoring: boolean;
  onBack: () => void;
  onRestore: () => void;
}) {
  const { diffWords } = require("diff") as typeof import("diff");
  // What restoring would do: from the text now on screen to the text of that version.
  const parts = diffWords(currentMarkdown, rev.markdown);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          Back to history
        </Button>
        {canRestore && (
          <Button size="sm" loading={restoring} onClick={onRestore}>
            Restore version {rev.version}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Changes restoring version {rev.version} would make: <mark className="bg-acacia/15 text-tone-sage-ink">added</mark>{" "}
        <mark className="bg-laterite/15 text-tone-clay-ink line-through">removed</mark>
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {parts.map((part, i) =>
          part.added ? (
            <mark key={i} className="rounded bg-acacia/15 px-0.5 text-tone-sage-ink">
              {part.value}
            </mark>
          ) : part.removed ? (
            <mark key={i} className="rounded bg-laterite/15 px-0.5 text-tone-clay-ink line-through">
              {part.value}
            </mark>
          ) : (
            <span key={i}>{part.value}</span>
          )
        )}
      </p>
    </div>
  );
}
