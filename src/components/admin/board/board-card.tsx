"use client";

import { ArrowUp, ArrowDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_STATUSES, BOARD_STATUS_LABELS, type BoardStatus } from "@/lib/board";
import { dueLabel, isOverdue, timeAgo, type BoardCardData } from "./types";

interface Props {
  card: BoardCardData;
  ownerLabel: string | null;
  projectName: string | null;
  movedBy: string | null;
  isFirst: boolean;
  isLast: boolean;
  draggable: boolean;
  dragging: boolean;
  dropIndicator: "above" | "below" | null;
  onOpen: () => void;
  onResolve: () => void;
  onMoveTo: (status: BoardStatus) => void;
  onNudge: (dir: "up" | "down") => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

// Part 37 (WS107). Pattern B: text block flexes, controls shrink-0.
export function BoardCard({
  card,
  ownerLabel,
  projectName,
  movedBy,
  isFirst,
  isLast,
  draggable,
  dragging,
  dropIndicator,
  onOpen,
  onResolve,
  onMoveTo,
  onNudge,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: Props) {
  const overdue = isOverdue(card.dueDate, card.status);
  const heard = [card.rawOwnerName, card.rawProjectName].filter(Boolean).map((s) => `'${s}'`);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "border border-border bg-card p-3 rounded-sm",
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        dropIndicator === "above" && "border-t-2 border-t-foreground",
        dropIndicator === "below" && "border-b-2 border-b-foreground"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="text-left text-sm text-foreground hover:underline break-words"
          >
            {card.title}
          </button>
          {card.notes && (
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {card.notes}
            </p>
          )}
        </div>
        {card.needsReview && (
          <button
            type="button"
            onClick={onResolve}
            title={heard.length ? `Heard as ${heard.join(", ")}` : "Needs review"}
            aria-label="Needs review: resolve names"
            className="-m-1 shrink-0 rounded-sm p-1 text-ochre hover:bg-ochre/10"
          >
            <AlertCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-xs text-muted-foreground">
        <span className="text-foreground">{ownerLabel ?? "Unassigned"}</span>
        {projectName && (
          <span className="rounded-sm border border-border px-1.5 py-0.5">{projectName}</span>
        )}
        {card.dueDate && (
          <span className={cn(overdue && "text-laterite")}>
            {overdue ? "Overdue " : "Due "}
            {dueLabel(card.dueDate)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label={`Move "${card.title}" to`}
          value=""
          onChange={(e) => {
            if (e.target.value) onMoveTo(e.target.value as BoardStatus);
          }}
          className="h-10 min-w-0 flex-1 rounded-sm border border-input bg-card pl-2 text-xs md:h-8 text-foreground"
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
            className="flex h-10 w-10 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 md:h-8 md:w-8"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Move "${card.title}" down`}
            disabled={isLast}
            onClick={() => onNudge("down")}
            className="flex h-10 w-10 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 md:h-8 md:w-8"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {movedBy && (
        <p
          className="mt-2 flex min-w-0 gap-1 font-mono text-[11px] text-muted-foreground"
          title={`Moved by ${movedBy}, ${timeAgo(card.updatedAt)}`}
        >
          <span className="truncate">moved by {movedBy}</span>
          <span className="shrink-0">· {timeAgo(card.updatedAt)}</span>
        </p>
      )}
    </div>
  );
}
