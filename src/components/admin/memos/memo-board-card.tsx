"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, NotebookText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/board-client";
import { MEMO_STATUS_LABELS } from "@/lib/memos";
import { relativeTime } from "@/lib/relative-time";
import { TONE_CLASSES, tileTone } from "@/lib/status-tone";
import { COLUMN_LABELS, COLUMN_TONE, DECISION_COLUMNS, adjacentColumn, columnOf, type ColumnKey } from "@/lib/memo-board";
import { MemoCompanyLabel } from "@/components/admin/memos/memo-company-label";
import { STATUS_VARIANT, ownerLabel, type MemoRow } from "@/components/admin/memos/types";

interface Props {
  memo: MemoRow;
  /** The signed-in user's id; their own cards read "You". */
  me: string | undefined;
  /** Desktop: draggable, with the card menu. Phone keeps a native Move-to select on the face. */
  desktop: boolean;
  dragging?: boolean;
  /** Just moved: plays the landing wash. */
  landed?: boolean;
  onMoveTo: (to: ColumnKey) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

const MAX_TAGS = 3;

// Part 43 (WS142.5): copies the team board card's markup and patterns (JC-MB-B), without its team-only features.
export function MemoBoardCard({ memo, me, desktop, dragging = false, landed = false, onMoveTo, onDragStart, onDragEnd }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const here = columnOf(memo.decision);
  const owner = memo.owner.id === me ? "You" : ownerLabel(memo.owner);
  const tags = memo.tags ?? [];
  const editable = memo.canEdit;
  const href = `/admin/memos/${memo.id}`;

  // Keyboard: `m` opens the menu, Alt+Left/Right moves to the neighbouring column.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!editable) return;
    const t = e.target as HTMLElement;
    if (t.closest("input,select,textarea,[role=menu]")) return;
    if (e.metaKey || e.ctrlKey) return;
    if (e.altKey) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const to = adjacentColumn(here, e.key === "ArrowLeft" ? "left" : "right");
      if (to) onMoveTo(to);
      e.preventDefault();
      return;
    }
    if (e.key === "m" && desktop) {
      e.preventDefault();
      setMenuOpen(true);
    }
  }

  return (
    <div
      data-card-id={memo.id}
      draggable={desktop && editable}
      onDragStart={desktop && editable ? onDragStart : undefined}
      onDragEnd={desktop && editable ? onDragEnd : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative rounded-sm border border-border bg-card px-3 py-2.5 transition-[border-color,opacity] hover:border-cocoa",
        desktop && editable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-35",
        landed && "animate-land motion-reduce:outline motion-reduce:outline-2 motion-reduce:outline-sky"
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          href={href}
          draggable={false}
          data-card-title
          className="min-w-0 flex-1 break-words text-left text-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {memo.title}
        </Link>
        {desktop && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for "${memo.title}"`}
                className={cn(
                  "-m-1 flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
                  menuOpen && "opacity-100"
                )}
              >
                <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                // Return focus to the card title, which survives a move.
                e.preventDefault();
                (document.querySelector(`[data-card-id="${memo.id}"] [data-card-title]`) as HTMLElement | null)?.focus();
              }}
            >
              {editable && (
                <>
                  <DropdownMenuLabel>Move to</DropdownMenuLabel>
                  {DECISION_COLUMNS.filter((k) => k !== here).map((k) => (
                    <DropdownMenuItem key={k} onSelect={() => onMoveTo(k)}>
                      <span aria-hidden="true" className={cn("h-[7px] w-[7px]", TONE_CLASSES[COLUMN_TONE[k]].dot)} />
                      {COLUMN_LABELS[k]}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <Link href={href}>
                  <NotebookText aria-hidden="true" className="h-3.5 w-3.5" />
                  Open memo
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        <MemoCompanyLabel companyRef={memo.companyRef} noneLabel="No company" />
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
        <Badge variant={STATUS_VARIANT[memo.status]}>{MEMO_STATUS_LABELS[memo.status]}</Badge>
        <span
          role="img"
          title={owner}
          aria-label={`Owner: ${owner}`}
          className={cn("inline-grid h-5 w-5 shrink-0 place-items-center font-display text-[10px] font-semibold", TONE_CLASSES[tileTone(owner)].chip)}
        >
          {initials(owner)}
        </span>
        <span title={new Date(memo.updatedAt).toLocaleString()}>{relativeTime(memo.updatedAt)}</span>
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.slice(0, MAX_TAGS).map((t) => (
            <span key={t} className="bg-tone-stone px-1.5 py-0.5 font-mono text-[11px] text-tone-stone-ink">
              {t}
            </span>
          ))}
          {tags.length > MAX_TAGS && (
            <span title={tags.slice(MAX_TAGS).join(", ")} className="font-mono text-[11px]">
              +{tags.length - MAX_TAGS}
            </span>
          )}
        </div>
      )}

      {/* Phone / narrow layout: the accessible path, since there is no drag on touch. */}
      {!desktop && editable && (
        <div className="mt-2">
          <select
            aria-label={`Move "${memo.title}" to`}
            value=""
            onChange={(e) => {
              if (e.target.value) onMoveTo(e.target.value as ColumnKey);
            }}
            className="h-10 w-full min-w-0 rounded-sm border border-input bg-card pl-2 text-xs text-foreground"
          >
            <option value="">Move to…</option>
            {DECISION_COLUMNS.filter((k) => k !== here).map((k) => (
              <option key={k} value={k}>
                {COLUMN_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
