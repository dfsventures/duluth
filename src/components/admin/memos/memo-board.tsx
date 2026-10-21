"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronsLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONES, TONE_CLASSES } from "@/lib/status-tone";
import { COLLAPSED_BY_DEFAULT, COLUMN_LABELS, COLUMN_TONE, DECISION_COLUMNS, columnOf, groupByDecision, type ColumnKey } from "@/lib/memo-board";
import { MemoBoardCard } from "@/components/admin/memos/memo-board-card";
import type { MemoRow } from "@/components/admin/memos/types";

interface Props {
  rows: MemoRow[];
  me: string | undefined;
  onMove: (id: string, to: ColumnKey) => void;
  /** Set by the page after a move so the card plays the landing wash. */
  landedId?: string | null;
}

const countLabel = (n: number) => `${n} ${n === 1 ? "memo" : "memos"}`;

// Part 43 (WS142.4): columns by Memo Decision. Owns only view state: the drag in flight, the drop
// target and which collapsed columns are open. Moves are the page's (optimistic, Undo, conflicts).
export function MemoBoard({ rows, me, onMove, landedId = null }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<ColumnKey | null>(null);
  const [expanded, setExpanded] = useState<Set<ColumnKey>>(() => new Set());
  const grouped = useMemo(() => groupByDecision(rows), [rows]);
  const dragged = draggingId ? rows.find((r) => r.id === draggingId) ?? null : null;
  const isCollapsed = (k: ColumnKey) => COLLAPSED_BY_DEFAULT.includes(k) && !expanded.has(k);
  const toggle = (k: ColumnKey) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const endDrag = () => {
    setDraggingId(null);
    setDropColumn(null);
  };

  function renderCard(m: MemoRow, desktop: boolean) {
    return (
      <MemoBoardCard
        key={m.id}
        memo={m}
        me={me}
        desktop={desktop}
        dragging={draggingId === m.id}
        landed={landedId === m.id}
        onMoveTo={(to) => onMove(m.id, to)}
        onDragStart={
          desktop
            ? (e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", m.id);
                setDraggingId(m.id);
              }
            : undefined
        }
        onDragEnd={desktop ? endDrag : undefined}
      />
    );
  }

  /** Drop handlers shared by a full column body and the collapsed rail. */
  function dropProps(k: ColumnKey) {
    const accepts = !!dragged && dragged.canEdit && columnOf(dragged.decision) !== k;
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!accepts) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropColumn !== k) setDropColumn(k);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropColumn((cur) => (cur === k ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = draggingId;
        endDrag();
        if (id && accepts) onMove(id, k);
      },
    };
  }
  const ring = (k: ColumnKey) => (dropColumn === k ? { boxShadow: `inset 0 0 0 1.5px ${TONES[COLUMN_TONE[k]].dot}` } : undefined);

  return (
    <>
      {/* Desktop: a row of columns. Passed is a narrow rail until opened. */}
      <div className="hidden gap-4 overflow-x-auto pb-2 md:flex">
        {DECISION_COLUMNS.map((k) => {
          const cards = grouped[k];
          const tone = COLUMN_TONE[k];
          if (isCollapsed(k)) {
            return (
              <button
                key={k}
                type="button"
                aria-expanded={false}
                aria-label={`Show ${COLUMN_LABELS[k]}, ${countLabel(cards.length)}`}
                onClick={() => toggle(k)}
                style={ring(k)}
                className="flex w-12 shrink-0 flex-col items-center gap-2 bg-well px-1 py-3 transition-shadow hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...dropProps(k)}
              >
                <span aria-hidden="true" className={cn("h-2 w-2 shrink-0", TONE_CLASSES[tone].dot)} />
                <span aria-hidden="true" className={cn("num px-1.5 font-mono text-[11px] font-semibold", TONE_CLASSES[tone].chip)}>
                  {cards.length}
                </span>
                <span aria-hidden="true" className="font-mono text-xs font-semibold uppercase tracking-label text-foreground [writing-mode:vertical-rl]">
                  {COLUMN_LABELS[k]}
                </span>
              </button>
            );
          }
          return (
            <div key={k} className="flex w-64 shrink-0 flex-col lg:min-w-[13rem] lg:flex-1">
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <span aria-hidden="true" className={cn("h-2 w-2 shrink-0", TONE_CLASSES[tone].dot)} />
                <h2 className="font-mono text-xs font-semibold uppercase tracking-label text-foreground">{COLUMN_LABELS[k]}</h2>
                <span className={cn("num ml-auto px-1.5 font-mono text-[11px] font-semibold", TONE_CLASSES[tone].chip)} aria-label={countLabel(cards.length)}>
                  {cards.length}
                </span>
                {COLLAPSED_BY_DEFAULT.includes(k) && (
                  <button
                    type="button"
                    aria-expanded
                    aria-label={`Collapse ${COLUMN_LABELS[k]}`}
                    onClick={() => toggle(k)}
                    className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronsLeft aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div style={ring(k)} className="flex min-h-24 flex-1 flex-col gap-2 bg-well p-2 transition-shadow" {...dropProps(k)}>
                {cards.map((m) => renderCard(m, true))}
                {cards.length === 0 && (
                  <p className="py-5 text-center font-mono text-[11px] uppercase tracking-label text-muted-foreground">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Phone: stacked sections, no drag. Passed starts closed. */}
      <div className="space-y-3 md:hidden">
        {DECISION_COLUMNS.map((k) => (
          <details
            key={k}
            open={!isCollapsed(k)}
            onToggle={(e) => {
              // Collapsed-by-default columns remember being opened (shared with the desktop rail).
              const open = (e.currentTarget as HTMLDetailsElement).open;
              if (COLLAPSED_BY_DEFAULT.includes(k) && open === isCollapsed(k)) toggle(k);
            }}
            className="group rounded-sm border border-border"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-foreground [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className={cn("h-2 w-2 shrink-0", TONE_CLASSES[COLUMN_TONE[k]].dot)} />
              <span>{COLUMN_LABELS[k]}</span>
              <span className="ml-auto text-muted-foreground" aria-label={countLabel(grouped[k].length)}>
                {grouped[k].length}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-2 bg-well p-2">
              {!isCollapsed(k) && grouped[k].map((m) => renderCard(m, false))}
              {grouped[k].length === 0 && (
                <p className="py-3 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Empty</p>
              )}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
