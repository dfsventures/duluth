"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Note, NoteRevision } from "./types";

function stripHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent ?? "";
}

function DiffPane({
  label,
  revision,
  otherRevision,
  isNewer = false,
}: {
  label: string;
  revision: NoteRevision;
  otherRevision: NoteRevision;
  isNewer?: boolean;
}) {
  const { diffWords } = require("diff") as typeof import("diff");

  const oldText = stripHtml(isNewer ? otherRevision.body : revision.body);
  const newText = stripHtml(isNewer ? revision.body : otherRevision.body);
  const parts = diffWords(oldText, newText);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="border-b bg-muted/40 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          {revision.editedBy.name ?? revision.editedBy.email} · {new Date(revision.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
        {revision.title !== otherRevision.title && (
          <p className={`mb-3 rounded px-2 py-1 font-semibold ${isNewer ? "bg-acacia/10 text-tone-sage-ink" : "bg-laterite/10 text-tone-clay-ink line-through"}`}>
            {revision.title}
          </p>
        )}
        <p className="whitespace-pre-wrap">
          {parts.map((part, i) => {
            if (isNewer) {
              if (part.added) return <mark key={i} className="bg-acacia/15 text-tone-sage-ink rounded px-0.5">{part.value}</mark>;
              if (part.removed) return null;
            } else {
              if (part.removed) return <mark key={i} className="bg-laterite/15 text-tone-clay-ink line-through rounded px-0.5">{part.value}</mark>;
              if (part.added) return null;
            }
            return <span key={i}>{part.value}</span>;
          })}
        </p>
      </div>
    </div>
  );
}

/** Edit history of one note: revision list, with a side-by-side word diff between revisions. */
export function NoteHistoryDialog({
  companyId,
  note,
  onClose,
}: {
  companyId: string;
  note: Note;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(true);
  const [diffLeft, setDiffLeft] = useState<NoteRevision | null>(null);
  const [diffRight, setDiffRight] = useState<NoteRevision | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/companies/${companyId}/notes/${note.id}/revisions`);
        if (res.ok && !cancelled) setRevisions(await res.json());
      } finally {
        if (!cancelled) setLoadingRevisions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, note.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={note.title} description="Edit history" className="sm:max-w-3xl">
    {diffLeft && diffRight ? (
      /* Side-by-side diff view */
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-6 py-3">
          <button
            onClick={() => { setDiffLeft(null); setDiffRight(null); }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to history
          </button>
          <span className="text-sm text-muted-foreground">
            Comparing revision {revisions.indexOf(diffRight) + 1} → {revisions.indexOf(diffLeft) + 1}
          </span>
        </div>
        <div className="grid flex-1 grid-cols-1 divide-y overflow-y-auto sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          <DiffPane label="Before" revision={diffRight} otherRevision={diffLeft} />
          <DiffPane label="After" revision={diffLeft} otherRevision={diffRight} isNewer />
        </div>
      </div>
    ) : (
      /* Revision list */
      <div className="overflow-y-auto p-6">
        {loadingRevisions ? (
          <p className="text-sm text-muted-foreground">Loading revisions...</p>
        ) : (
          <div className="space-y-3">
            {revisions.map((rev, idx) => (
              <div
                key={rev.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {idx === 0 ? "Current version" : `Revision ${revisions.length - idx}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {rev.editedBy.name ?? rev.editedBy.email} · {new Date(rev.createdAt).toLocaleString()}
                  </p>
                </div>
                {idx < revisions.length - 1 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDiffLeft(rev);
                      setDiffRight(revisions[idx + 1]);
                    }}
                  >
                    Compare with previous
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )}
      </DialogContent>
    </Dialog>
  );
}
