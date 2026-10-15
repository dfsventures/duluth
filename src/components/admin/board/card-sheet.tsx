"use client";

import { useRef, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BOARD_STATUS_LABELS } from "@/lib/board";
import { hostOf, linkifyNotes, MAX_LINKS_PER_CARD, MAX_LINK_LABEL_LENGTH, MAX_LINK_URL_LENGTH } from "@/lib/board-links";
import { toast } from "@/lib/toast";
import { dueLabel, type BoardCardData, type BoardCardLinkData } from "./types";

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  GRANOLA: "Granola meeting",
  DIGEST_PASTE: "Pasted digest",
  DIGEST_IMPORT: "Digest import",
};

interface Props {
  card: BoardCardData;
  ownerLabels: string[];
  projectName: string | null;
  /** user id -> display label, for the history lines. */
  userLabel: (userId: string | null | undefined) => string | null;
  /** Focus the Proof "add link" field on open (from the Done nudge). */
  focusProof?: boolean;
  onEdit: () => void;
  onClose: () => void;
  /** A link was added or removed; the board merges the new list. */
  onLinksChanged: (cardId: string, links: BoardCardLinkData[]) => void;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-2 text-sm">
      <dt className="label pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

// Read-only view of a card. Notes are plain text: auto-linked http(s) URLs are
// rendered as React elements, never as HTML.
export function CardSheet({ card, ownerLabels, projectName, userLabel, focusProof, onEdit, onClose, onLinksChanged }: Props) {
  const links = card.links ?? [];
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const atCap = links.length >= MAX_LINKS_PER_CARD;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Paste a link first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/board/cards/${card.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ...(label.trim() ? { label } : {}) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Couldn't add that link.");
      }
      const created: BoardCardLinkData = await res.json();
      onLinksChanged(card.id, [...links, created]);
      setUrl("");
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that link.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(linkId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/board/cards/${card.id}/links/${linkId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Couldn't remove that link.");
      }
      onLinksChanged(card.id, links.filter((l) => l.id !== linkId));
      setConfirmId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove that link.");
    } finally {
      setBusy(false);
    }
  }

  const createdBy = card.createdById ? userLabel(card.createdById) : null;
  const editedBy = userLabel(card.updatedById);
  const edited = card.humanEditedAt ?? null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={card.title}
        onOpenAutoFocus={
          focusProof
            ? (e) => {
                e.preventDefault();
                urlRef.current?.focus();
              }
            : undefined
        }
      >
        <SheetBody className="space-y-6">
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" /> Edit
            </Button>
          </div>

          <dl className="divide-y divide-border">
            <Row label="Status">{BOARD_STATUS_LABELS[card.status]}</Row>
            <Row label="Owners">
              {ownerLabels.length || card.unmatchedOwnerNames.length ? (
                <>
                  {[...ownerLabels].sort((a, b) => a.localeCompare(b)).join(", ")}
                  {card.unmatchedOwnerNames.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      Not yet matched: {card.unmatchedOwnerNames.map((n) => `'${n}'`).join(", ")}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </Row>
            <Row label="Project">{projectName ?? <span className="text-muted-foreground">None</span>}</Row>
            <Row label="Due">{card.dueDate ? dueLabel(card.dueDate) : <span className="text-muted-foreground">No date</span>}</Row>
            <Row label="Source">{SOURCE_LABELS[card.source ?? "MANUAL"] ?? card.source}</Row>
          </dl>

          <section aria-labelledby="cs-notes">
            <h3 id="cs-notes" className="label mb-2">Notes</h3>
            {card.notes ? (
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                {linkifyNotes(card.notes).map((seg, i) =>
                  seg.type === "link" ? (
                    <a
                      key={i}
                      href={seg.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:text-primary-hover"
                    >
                      {seg.text}
                    </a>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  )
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes.</p>
            )}
          </section>

          <section aria-labelledby="cs-proof">
            <h3 id="cs-proof" className="label mb-2">
              Proof <span className="normal-case tracking-normal text-muted-foreground">({links.length}/{MAX_LINKS_PER_CARD})</span>
            </h3>
            {links.length === 0 ? (
              <p className="mb-3 text-sm text-muted-foreground">No links yet. Add a link to the work.</p>
            ) : (
              <ul className="mb-3 divide-y divide-border border border-border">
                {links.map((l) => (
                  <li key={l.id} className="flex items-start gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 break-all text-sm text-primary underline underline-offset-2 hover:text-primary-hover"
                      >
                        {l.label || l.url}
                        <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
                      </a>
                      <p className="font-mono text-[11px] text-muted-foreground">{hostOf(l.url)}</p>
                    </div>
                    {confirmId === l.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(l.id)}>
                          Remove
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                          Keep
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove link ${l.label || hostOf(l.url)}`}
                        onClick={() => setConfirmId(l.id)}
                        className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {atCap ? (
              <p className="text-xs text-muted-foreground">This card has the maximum of {MAX_LINKS_PER_CARD} links. Remove one to add another.</p>
            ) : (
              <form onSubmit={add} className="space-y-3">
                <Input
                  ref={urlRef}
                  id="cs-link-url"
                  label="Link"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={url}
                  maxLength={MAX_LINK_URL_LENGTH}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Input
                  id="cs-link-label"
                  label="Label (optional)"
                  value={label}
                  maxLength={MAX_LINK_LABEL_LENGTH}
                  onChange={(e) => setLabel(e.target.value)}
                />
                {error && <p className="text-xs text-tone-clay-ink">{error}</p>}
                <Button type="submit" size="sm" variant="secondary" disabled={busy}>
                  {busy ? "Adding..." : "Add link"}
                </Button>
              </form>
            )}
          </section>

          <section aria-labelledby="cs-history">
            <h3 id="cs-history" className="label mb-1">History</h3>
            <dl className="divide-y divide-border">
              {card.createdAt && (
                <Row label="Created">
                  {fmt(card.createdAt)}
                  {createdBy ? ` by ${createdBy}` : card.createdById ? "" : " (automated)"}
                </Row>
              )}
              <Row label="Last edited">
                {fmt(edited ?? card.updatedAt)}
                {editedBy ? ` by ${editedBy}` : ""}
                {!edited && <span className="block text-xs text-muted-foreground">Not edited by a person yet</span>}
              </Row>
              {card.completedAt && <Row label="Completed">{fmt(card.completedAt)}</Row>}
              {card.archivedAt && <Row label="Archived">{fmt(card.archivedAt)}</Row>}
            </dl>
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
