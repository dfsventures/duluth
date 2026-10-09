"use client";

import { cn } from "@/lib/utils";
import { BOARD_STATUS_LABELS, type BoardStatus } from "@/lib/board";

interface Props {
  status: BoardStatus;
  count: number;
  /** Desktop only: the column body accepts drops (end of column). */
  droppable?: boolean;
  isDropTarget?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  children: React.ReactNode;
}

// Desktop column. The mobile equivalent is a <details> built in the page.
export function BoardColumn({ status, count, droppable, isDropTarget, onDragOver, onDrop, children }: Props) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
          {BOARD_STATUS_LABELS[status]}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      </div>
      <div
        onDragOver={droppable ? onDragOver : undefined}
        onDrop={droppable ? onDrop : undefined}
        className={cn(
          "min-h-24 flex-1 space-y-2 rounded-sm bg-muted/40 p-2",
          isDropTarget && "ring-2 ring-ring"
        )}
      >
        {children}
        {count === 0 && (
          <p className="py-6 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {isDropTarget ? "Drop here" : "Empty"}
          </p>
        )}
      </div>
    </div>
  );
}
