"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Link2, MoreHorizontal, Pencil, SearchCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_STATUSES, BOARD_STATUS_LABELS, type BoardStatus } from "@/lib/board";
import { adjacentStatus, initials, ownerTileModel } from "@/lib/board-client";
import { statusTone, tileTone, TONE_CLASSES } from "@/lib/status-tone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dueLabel, isOverdue, timeAgo, type BoardCardData } from "./types";

interface Props {
  card: BoardCardData;
  /** Part 38: owner labels, already sorted alphabetically (no owner reads as the lead). */
  ownerLabels: string[];
  projectName: string | null;
  movedBy: string | null;
  isFirst: boolean;
  isLast: boolean;
  /** Desktop: draggable, with the card menu. Mobile keeps the Move-to select and arrows on the face. */
  desktop: boolean;
  dragging: boolean;
  /** Just moved or created: plays the Sky landing wash. */
  landed: boolean;
  /** Opens the read-only view sheet. */
  onOpen: () => void;
  /** Opens the edit form directly. */
  onEdit: () => void;
  onResolve: () => void;
  onMoveTo: (status: BoardStatus) => void;
  onNudge: (dir: "up" | "down") => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

// Phase 6 card face: title, owner tile, project tag, due date, review marker.
// Everything else (notes, who moved it, move controls) lives in the dialog, the
// menu and the tooltip. The mobile layout keeps the Move-to select and arrows,
// since there is no drag on touch and they are the accessible path there.
export function BoardCard({
  card,
  ownerLabels,
  projectName,
  movedBy,
  isFirst,
  isLast,
  desktop,
  dragging,
  landed,
  onOpen,
  onEdit,
  onResolve,
  onMoveTo,
  onNudge,
  onDragStart,
  onDragEnd,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const overdue = isOverdue(card.dueDate, card.status);
  const heard = [...card.unmatchedOwnerNames, card.rawProjectName].filter(Boolean).map((s) => `'${s}'`);
  const tiles = ownerTileModel(ownerLabels);
  const tooltip = [
    card.notes ? card.notes.slice(0, 160) : null,
    movedBy ? `Moved by ${movedBy}, ${timeAgo(card.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Keyboard path for moving (spec 6.9): focus the card, then
  //   m       open the card menu          e       edit
  //   Alt+Up/Down  move within the column  Alt+Left/Right  move to the neighbouring column
  function onKeyDown(e: React.KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("input,select,textarea,[role=menu]")) return;
    if (e.metaKey || e.ctrlKey) return;
    if (e.altKey) {
      if (e.key === "ArrowUp" && !isFirst) onNudge("up");
      else if (e.key === "ArrowDown" && !isLast) onNudge("down");
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const to = adjacentStatus(card.status, e.key === "ArrowLeft" ? "left" : "right");
        if (to) onMoveTo(to);
      } else return;
      e.preventDefault();
      return;
    }
    if (e.key === "m" && desktop) {
      e.preventDefault();
      setMenuOpen(true);
    } else if (e.key === "e") {
      e.preventDefault();
      onEdit();
    }
  }

  return (
    <div
      data-card-id={card.id}
      draggable={desktop}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      title={tooltip || undefined}
      className={cn(
        "group relative border border-border bg-card px-3 py-2.5 rounded-sm transition-[border-color,opacity] hover:border-cocoa",
        desktop && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-35",
        landed && "animate-land motion-reduce:outline motion-reduce:outline-2 motion-reduce:outline-sky"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          data-card-title
          onClick={onOpen}
          className="min-w-0 flex-1 break-words text-left text-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {card.title}
        </button>
        {card.needsReview && (
          <button
            type="button"
            onClick={onResolve}
            title={heard.length ? `Heard as ${heard.join(", ")}` : "Needs review"}
            aria-label="Needs review: resolve names"
            className="-m-1.5 flex h-6 w-6 shrink-0 items-center justify-center hover:bg-attention-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="h-[7px] w-[7px] bg-ochre" />
          </button>
        )}
        {desktop && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for "${card.title}"`}
                className={cn(
                  "-m-1 flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
                  menuOpen && "opacity-100"
                )}
              >
                <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={(e) => {
              // Return focus to the card title, which survives a move.
              e.preventDefault();
              (document.querySelector(`[data-card-id="${card.id}"] [data-card-title]`) as HTMLElement | null)?.focus();
            }}>
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {BOARD_STATUSES.filter((s) => s !== card.status).map((s) => (
                <DropdownMenuItem key={s} onSelect={() => onMoveTo(s)}>
                  <span
                    aria-hidden="true"
                    className={cn("h-[7px] w-[7px]", TONE_CLASSES[statusTone(BOARD_STATUS_LABELS[s])].dot)}
                  />
                  {BOARD_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isFirst} onSelect={() => onNudge("up")}>
                <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLast} onSelect={() => onNudge("down")}>
                <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpen}>
                <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              {card.needsReview && (
                <DropdownMenuItem onSelect={onResolve}>
                  <SearchCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  Resolve names
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
        {ownerLabels.length === 0 ? (
          <span
            title="Unassigned"
            aria-label="Unassigned"
            role="img"
            className="inline-grid h-5 w-5 shrink-0 place-items-center border border-dashed border-border font-display text-[10px] text-muted-foreground"
          >
            ?
          </span>
        ) : ownerLabels.length === 1 ? (
          <span
            title={ownerLabels[0]}
            aria-label={`Owner: ${ownerLabels[0]}`}
            role="img"
            className={cn(
              "inline-grid h-5 w-5 shrink-0 place-items-center font-display text-[10px] font-semibold",
              TONE_CLASSES[tileTone(ownerLabels[0])].chip
            )}
          >
            {initials(ownerLabels[0])}
          </span>
        ) : (
          <span
            role="img"
            aria-label={`Owners: ${ownerLabels.join(", ")}`}
            title={ownerLabels.join(", ")}
            className="inline-flex shrink-0 items-center"
          >
            {tiles.shown.map((label) => (
              <span
                key={label}
                aria-hidden="true"
                className={cn(
                  "-ml-1.5 inline-grid h-5 w-5 place-items-center font-display text-[10px] font-semibold ring-1 ring-card first:ml-0",
                  TONE_CLASSES[tileTone(label)].chip
                )}
              >
                {initials(label)}
              </span>
            ))}
            {tiles.extra > 0 && (
              <span
                aria-hidden="true"
                className="-ml-1.5 inline-grid h-5 min-w-5 place-items-center bg-muted px-1 font-display text-[10px] font-semibold text-foreground ring-1 ring-card"
              >
                +{tiles.extra}
              </span>
            )}
          </span>
        )}
        {projectName && (
          <span className="bg-tone-stone px-1.5 py-0.5 font-mono text-[11px] text-tone-stone-ink">{projectName}</span>
        )}
        {card.status === "DONE" && (card.links?.length ?? 0) > 0 && (
          <span
            title={`${card.links!.length} proof link${card.links!.length === 1 ? "" : "s"}`}
            aria-label={`${card.links!.length} proof link${card.links!.length === 1 ? "" : "s"}`}
            role="img"
            className="inline-flex items-center gap-1 font-mono text-[11px]"
          >
            <Link2 aria-hidden="true" className="h-3 w-3" />
            {card.links!.length}
          </span>
        )}
        {card.dueDate && (
          <span
            className={cn(
              "font-mono text-[11px]",
              overdue && "bg-tone-clay px-1.5 py-0.5 text-tone-clay-ink"
            )}
          >
            {overdue ? "Overdue " : "Due "}
            {dueLabel(card.dueDate)}
          </span>
        )}
      </div>

      {/* Touch / narrow layout: the accessible path, since there is no drag. */}
      {!desktop && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            aria-label={`Move "${card.title}" to`}
            value=""
            onChange={(e) => {
              if (e.target.value) onMoveTo(e.target.value as BoardStatus);
            }}
            className="h-10 min-w-0 flex-1 rounded-sm border border-input bg-card pl-2 text-xs text-foreground"
          >
            <option value="">Move to…</option>
            {BOARD_STATUSES.filter((s) => s !== card.status).map((s) => (
              <option key={s} value={s}>
                {BOARD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label={`Move "${card.title}" up`}
              disabled={isFirst}
              onClick={() => onNudge("up")}
              className="flex h-10 w-10 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Move "${card.title}" down`}
              disabled={isLast}
              onClick={() => onNudge("down")}
              className="flex h-10 w-10 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

