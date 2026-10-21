"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2Off, MoreHorizontal, NotebookText } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { TONE_CLASSES, tileTone } from "@/lib/status-tone";
import { COLUMN_LABELS, COLUMN_TONE, adjacentColumn, boardTime, columnOf, isIdle, moveTargets, sameName, tagLine, type ColumnKey } from "@/lib/memo-board";
import { MemoCompanyLabel } from "@/components/admin/memos/memo-company-label";
import { ownerLabel, type MemoRow } from "@/components/admin/memos/types";

interface Props {
  memo: MemoRow;
  /** The signed-in user's id; their own chip reads "You" in its tooltip. */
  me: string | undefined;
  /** Desktop: draggable. Both layouts have the card menu. */
  desktop: boolean;
  /** Hidden on the Mine tab, where every card is the viewer's. */
  showOwner: boolean;
  dragging?: boolean;
  /** Just moved: plays the landing wash. */
  landed?: boolean;
  onMoveTo: (to: ColumnKey) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

// Part 43 (WS142.5): copies the team board card's markup and patterns (JC-MB-B), without its team-only features.
export function MemoBoardCard({ memo, me, desktop, showOwner, dragging = false, landed = false, onMoveTo, onDragStart, onDragEnd }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const here = columnOf(memo.decision);
  const ownerName = ownerLabel(memo.owner);
  const ownerTip = memo.owner.id === me ? "You" : ownerName;
  const tags = memo.tags ?? [];
  const { text: tagText, more } = tagLine(tags);
  const idle = isIdle(memo);
  const dot = { DRAFT: "border border-[#8C897B] bg-transparent", IN_REVIEW: TONE_CLASSES.amber.dot, FINAL: TONE_CLASSES.sage.dot }[memo.status];
  const ownerChip = (
    <span
      role="img"
      title={`Owner: ${ownerTip}`}
      aria-label={`Owner: ${ownerTip}`}
      className={cn("ml-auto inline-grid h-5 w-5 shrink-0 place-items-center font-display text-[10px] font-semibold", TONE_CLASSES[tileTone(ownerName)].chip)}
    >
      {initials(ownerName)}
    </span>
  );
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
          title={memo.title}
          className="line-clamp-2 min-w-0 flex-1 break-words text-left text-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {memo.title}
        </Link>
        {memo.companyRef.kind === "pending" && (
          <span title="Not linked" className="mt-0.5 shrink-0 text-muted-foreground">
            <Link2Off aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only">Not linked</span>
          </span>
        )}
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
                {moveTargets(here).map((k) => (
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
      </div>

      {(memo.companyRef.kind === "none" || !sameName(memo.companyRef.name, memo.title)) && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <MemoCompanyLabel companyRef={memo.companyRef} noneLabel="No company" badge={false} />
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0", dot)} />
        {memo.status === "FINAL" ? <span className="sr-only">Final</span> : <span>{MEMO_STATUS_LABELS[memo.status]}</span>}
        {memo.status !== "FINAL" && <span aria-hidden="true">·</span>}
        <span title={new Date(memo.updatedAt).toLocaleString()} className={cn(idle && "text-tone-amber-ink")}>
          {idle ? `Idle · ${boardTime(memo.updatedAt)}` : boardTime(memo.updatedAt)}
        </span>
        {showOwner && ownerChip}
      </div>

      {tags.length > 0 && (
        <p className="mt-1 truncate text-xs text-muted-foreground" title={tags.join(", ")}>
          <span className="sr-only">Tags: </span>
          {tagText}
          {more > 0 && ` +${more}`}
        </p>
      )}
    </div>
  );
}
