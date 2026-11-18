"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, EyeOff, History, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { MEMO_LIMITS } from "@/lib/memos";
import { cn } from "@/lib/utils";
import { useNewLook } from "@/lib/use-new-look";
import { CLAMP_WORDS, firstSentence, wordCount } from "./dossier-utils";
import { CitationChips } from "./citation-chips";
import { CitationsEditor } from "./citations-editor";
import { HistoryDialog } from "./history-dialog";
import { readError, type MemoCitation, type MemoSectionView } from "./types";

const CONFLICT = "Someone else saved this section while you were editing. Copy your text, reload, then paste it back.";

const sameCitations = (a: MemoCitation[], b: MemoCitation[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One memo section: rendered text (server-sanitized HTML), citation chips, and an inline editor.
 * The editor is a plain Textarea with Write / Preview tabs (the preview is rendered by the server,
 * so this bundle carries no markdown library). Every save carries `expectedVersion`; a 409 keeps
 * the user's text in the box and shows the conflict banner.
 */
export function SectionCard({
  memoId,
  section,
  canEdit,
  canManage,
  onChanged,
  onOpenShare,
  folded,
  onToggleFold,
}: {
  memoId: string;
  section: MemoSectionView;
  canEdit: boolean;
  canManage: boolean;
  onChanged: () => void;
  /** Opens the Share panel from the "Hidden from share links" note. */
  onOpenShare?: () => void;
  /** New look only: the section is folded (the page owns the state so Fold all / Unfold all work). */
  folded?: boolean;
  onToggleFold?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [markdown, setMarkdown] = useState(section.markdown);
  const [citations, setCitations] = useState<MemoCitation[]>(section.citations);
  const [includeInShare, setIncludeInShare] = useState(section.includeInShare);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // The version this edit started from: a refresh while editing must not silently rebase the user's text.
  const baseVersion = useRef(section.version);

  // Not editing: follow the server's copy (after a save, restore or refresh).
  useEffect(() => {
    if (editing) return;
    setTitle(section.title);
    setMarkdown(section.markdown);
    setCitations(section.citations);
    setIncludeInShare(section.includeInShare);
    baseVersion.current = section.version;
  }, [section, editing]);

  const dirty =
    title !== section.title ||
    markdown !== section.markdown ||
    !sameCitations(citations, section.citations) ||
    (canManage && includeInShare !== section.includeInShare);

  function startEdit() {
    baseVersion.current = section.version;
    setTab("write");
    setPreviewHtml(null);
    setError("");
    setConflict(false);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setConflict(false);
    setError("");
  }

  async function showPreview() {
    setTab("preview");
    setPreviewError("");
    setPreviewHtml(null);
    try {
      const res = await fetch("/api/admin/memos/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't render the preview."));
      setPreviewHtml((await res.json()).html);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Couldn't render the preview.");
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        expectedVersion: baseVersion.current,
        title,
        markdown,
        citations: citations.map((c) => ({ ...c, label: c.label.trim() })),
      };
      if (canManage && includeInShare !== section.includeInShare) body.includeInShare = includeInShare;
      const res = await fetch(`/api/admin/memos/${memoId}/sections/${section.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        setConflict(true);
        return;
      }
      if (!res.ok) throw new Error(await readError(res, "Couldn't save the section."));
      toast.success("Section saved.");
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the section.");
    } finally {
      setSaving(false);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Copied your text.");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  const hiddenMarker = !section.includeInShare
    ? onOpenShare
      ? (
        <button
          type="button"
          onClick={onOpenShare}
          title="Left out of share links. The owner changes this when editing the section."
          className="memo-no-print inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <EyeOff aria-hidden className="h-3.5 w-3.5" />
          Hidden from share links
        </button>
      )
      : (
        <span className="memo-no-print inline-flex items-center gap-1 text-xs text-muted-foreground">
          <EyeOff aria-hidden className="h-3.5 w-3.5" />
          Hidden from share links
        </span>
      )
    : null;

  // New look (direction B): fold, word count, Show all on long sections, Edit/History on hover or focus.
  const newLook = useNewLook();
  const [expanded, setExpanded] = useState(false);
  const words = wordCount(section.markdown);
  const clampable = newLook && !!section.html && words > CLAMP_WORDS;
  const isFolded = newLook && !!folded && !editing;
  const isClamped = clampable && !expanded && !editing;

  function startEditUnfolded() {
    if (folded) onToggleFold?.();
    startEdit();
  }

  return (
    <section
      id={`section-${section.key}`}
      data-folded={newLook ? String(isFolded) : undefined}
      data-clamped={newLook ? String(isClamped) : undefined}
      className="memo-section scroll-mt-24 lg:scroll-mt-6 border-t border-border pt-6 first:border-t-0 first:pt-0 v2:border-t-0 v2:pt-0"
    >
      {newLook ? (
        <div className="mb-2 flex min-h-9 items-center gap-3">
          <h2 className="min-w-0 font-sans text-heading font-semibold text-foreground">
            <button
              type="button"
              aria-expanded={!isFolded}
              onClick={onToggleFold}
              className="-ml-1 flex min-w-0 items-center gap-2 rounded-ctl px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform print:hidden", isFolded && "-rotate-90")} />
              <span className="min-w-0 break-words">{section.title}</span>
            </button>
          </h2>
          {hiddenMarker}
          <span className="memo-no-print shrink-0 text-meta text-muted-foreground">
            {words ? `${words.toLocaleString("en-US")} ${words === 1 ? "word" : "words"}` : "empty"}
          </span>
          {!editing && (
            <>
              <div className="memo-sact memo-no-print ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} aria-label={`History of ${section.title}`}>
                  <History className="h-4 w-4" />
                  History
                </Button>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={startEditUnfolded} aria-label={`Edit ${section.title}`}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>
              <div className="memo-smore memo-no-print ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${section.title}`}>
                      <MoreHorizontal aria-hidden className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canEdit && (
                      <DropdownMenuItem onSelect={startEditUnfolded}>
                        <Pencil aria-hidden className="h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setShowHistory(true)}>
                      <History aria-hidden className="h-3.5 w-3.5" />
                      History
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-foreground v2:font-sans v2:text-heading">{section.title}</h2>
            {hiddenMarker}
          </div>
          {!editing && (
            <div className="memo-no-print flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} aria-label={`History of ${section.title}`}>
                <History className="h-4 w-4" />
                History
              </Button>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={startEdit} aria-label={`Edit ${section.title}`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {newLook && (
        <p className="memo-fold-sum memo-no-print ml-6 hidden truncate text-body text-muted-foreground" >
          {firstSentence(section.markdown) || "No text yet."}
        </p>
      )}

      {editing ? (
        <div className="memo-no-print space-y-4">
          {conflict && (
            <div role="alert" className="border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="text-foreground">{CONFLICT}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={copyText}>
                  Copy my text
                </Button>
                <Button size="sm" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              </div>
            </div>
          )}
          <Input
            id={`title-${section.key}`}
            label="Section title"
            value={title}
            maxLength={MEMO_LIMITS.sectionTitle}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div>
            <div role="tablist" aria-label="Editor mode" className="mb-2 flex gap-4 border-b border-border v2:border-b-0">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => (t === "preview" ? showPreview() : setTab("write"))}
                  className={`-mb-px border-b-2 py-2 text-sm font-medium v2:text-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "write" ? "Write" : "Preview"}
                </button>
              ))}
            </div>
            {tab === "write" ? (
              <>
                <Textarea
                  aria-label={`${section.title} text`}
                  className="min-h-[240px] font-mono text-sm"
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder={section.guidance ?? "Write in Markdown. Tables, lists and **bold** work."}
                />
                <p className={`mt-1 text-xs ${markdown.length > MEMO_LIMITS.sectionChars ? "text-destructive" : "text-muted-foreground"}`}>
                  <span className="num font-mono">
                    {markdown.length.toLocaleString("en-US")} / {MEMO_LIMITS.sectionChars.toLocaleString("en-US")}
                  </span>{" "}
                  characters. Markdown: tables, lists, links. Images and raw HTML are not shown.
                </p>
              </>
            ) : previewError ? (
              <p role="alert" className="text-sm text-destructive">
                {previewError}
              </p>
            ) : previewHtml === null ? (
              <p className="text-sm text-muted-foreground">Rendering preview...</p>
            ) : (
              <div className="prose prose-sm max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            )}
          </div>
          <CitationsEditor value={citations} onChange={setCitations} />
          {canManage && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeInShare} onChange={(e) => setIncludeInShare(e.target.checked)} />
              Include in share links
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty || !title.trim() || markdown.length > MEMO_LIMITS.sectionChars}>
              Save section
            </Button>
          </div>
        </div>
      ) : (
        <>
          {section.html ? (
            <div className="memo-body prose prose-sm max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: section.html }} />
          ) : (
            <p className="memo-body text-sm text-muted-foreground">
              No text yet.
              {section.guidance && <span className="memo-no-print"> {section.guidance}</span>}
            </p>
          )}
          {clampable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="memo-more memo-no-print mt-1 h-8 rounded-ctl text-row text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? "Show less" : `Show all ${words.toLocaleString("en-US")} words`}
            </button>
          )}
          <div className="memo-cites contents">
            <CitationChips citations={section.citations} />
          </div>
        </>
      )}

      {showHistory && (
        <HistoryDialog
          memoId={memoId}
          sectionKey={section.key}
          sectionTitle={section.title}
          currentMarkdown={section.markdown}
          currentVersion={section.version}
          canEdit={canEdit}
          onClose={() => setShowHistory(false)}
          onRestored={onChanged}
        />
      )}
    </section>
  );
}
