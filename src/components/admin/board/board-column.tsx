"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_STATUS_LABELS, type BoardStatus } from "@/lib/board";
import { insertionIndex } from "@/lib/board-client";
import { statusTone, TONES, TONE_CLASSES } from "@/lib/status-tone";

interface Props {
  status: BoardStatus;
  /** The cards in display order. Rendering is the page's; the column places the insertion line. */
  cards: { id: string; node: React.ReactNode }[];
  /** Desktop only: the column body accepts drops. */
  droppable?: boolean;
  /** Card being dragged (hidden from the insertion maths). */
  draggingId: string | null;
  /** Index among the other cards where a drop would land, or null when not hovering here. */
  dropIndex: number | null;
  onDropIndexChange: (status: BoardStatus, index: number | null) => void;
  onDropAt: (status: BoardStatus, index: number) => void;
  /** Quick-add: resolves true when the card was created. */
  onQuickAdd?: (status: BoardStatus, title: string) => Promise<boolean>;
}

// Desktop column (phase 6): a mono header with a tinted count, a `well` body, a
// 2px insertion line while dragging, and a title-only quick-add at the bottom.
// The mobile equivalent is a <details> built in the page.
export function BoardColumn({
  status,
  cards,
  droppable,
  draggingId,
  dropIndex,
  onDropIndexChange,
  onDropAt,
  onQuickAdd,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const tone = statusTone(BOARD_STATUS_LABELS[status]);
  const isTarget = dropIndex !== null;

  function indexFromPointer(clientY: number): number {
    const els = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? []).filter(
      (el) => el.dataset.cardId !== draggingId
    );
    const mids = els.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    return insertionIndex(mids, clientY);
  }

  const line = (
    <div key="insertion-line" aria-hidden="true" className="relative -my-1 h-0.5 bg-sky">
      <span className="absolute -left-0.5 -top-0.5 h-1.5 w-1.5 bg-sky" />
    </div>
  );

  const children: React.ReactNode[] = [];
  let k = 0;
  for (const c of cards) {
    if (c.id !== draggingId) {
      if (isTarget && dropIndex === k) children.push(line);
      k++;
    }
    children.push(<div key={c.id}>{c.node}</div>);
  }
  if (isTarget && dropIndex === k) children.push(line);

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0", TONE_CLASSES[tone].dot)} />
        <h2 className="font-mono text-xs font-semibold uppercase tracking-label text-foreground">
          {BOARD_STATUS_LABELS[status]}
        </h2>
        <span
          className={cn("num ml-auto px-1.5 font-mono text-[11px] font-semibold", TONE_CLASSES[tone].chip)}
          aria-label={`${cards.length} ${cards.length === 1 ? "item" : "items"}`}
        >
          {cards.length}
        </span>
      </div>
      <div
        ref={bodyRef}
        onDragOver={
          droppable
            ? (e) => {
                if (!draggingId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const idx = indexFromPointer(e.clientY);
                if (idx !== dropIndex) onDropIndexChange(status, idx);
              }
            : undefined
        }
        onDragLeave={
          droppable
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDropIndexChange(status, null);
              }
            : undefined
        }
        onDrop={
          droppable
            ? (e) => {
                e.preventDefault();
                if (draggingId) onDropAt(status, indexFromPointer(e.clientY));
              }
            : undefined
        }
        style={isTarget ? { boxShadow: `inset 0 0 0 1.5px ${TONES[tone].dot}` } : undefined}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 bg-well p-2 transition-shadow",
          // Nothing but the empty-column hint inside: centre it.
          cards.length === 0 && "justify-start"
        )}
      >
        {children}
        {cards.length === 0 && !isTarget && (
          <p className="py-5 text-center font-mono text-[11px] uppercase tracking-label text-muted-foreground">Empty</p>
        )}
        {onQuickAdd && <QuickAdd status={status} onAdd={onQuickAdd} />}
      </div>
    </div>
  );
}

/**
 * Title-only add at the bottom of a column. Enter saves and keeps the box open
 * for the next one; Escape closes it.
 */
function QuickAdd({ status, onAdd }: { status: BoardStatus; onAdd: (s: BoardStatus, t: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const label = BOARD_STATUS_LABELS[status];

  async function submit() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await onAdd(status, t);
    setBusy(false);
    if (ok) setTitle("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-1.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        Add item
        <span className="sr-only"> to {label}</span>
      </button>
    );
  }

  return (
    <div>
      <label htmlFor={`quick-add-${status}`} className="sr-only">
        New item title for {label}
      </label>
      <input
        id={`quick-add-${status}`}
        autoFocus
        value={title}
        maxLength={300}
        disabled={busy}
        placeholder="Title, then Enter"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!title.trim()) setOpen(false);
        }}
        className="h-9 w-full border border-input bg-card px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
    </div>
  );
}
