"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONES, TONE_CLASSES } from "@/lib/status-tone";
import { COLLAPSED_BY_DEFAULT, COLUMN_LABELS, COLUMN_TONE, DECISION_COLUMNS, columnOf, groupByDecision, landingIndex, type ColumnKey } from "@/lib/memo-board";
import { MemoBoardCard } from "@/components/admin/memos/memo-board-card";
import type { MemoRow } from "@/components/admin/memos/types";

interface Props {
  rows: MemoRow[];
  me: string | undefined;
  /** Owner chips are hidden on the Mine tab. */
  showOwner: boolean;
  onMove: (id: string, to: ColumnKey) => void;
  /** Set by the page after a move so the card plays the landing wash. */
  landedId?: string | null;
}

const countLabel = (n: number) => `${n} ${n === 1 ? "memo" : "memos"}`;

// Part 43 (WS142.4): columns by Memo Decision. Owns only view state: the drag in flight, the drop
// target and which collapsed columns are open. Moves are the page's (optimistic, Undo, conflicts).
export function MemoBoard({ rows, me, showOwner, onMove, landedId = null }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<ColumnKey | null>(null);
  const [expanded, setExpanded] = useState<Set<ColumnKey>>(() => new Set());
  const grouped = useMemo(() => groupByDecision(rows), [rows]);
  // Phone: the first non-empty section opens by default.
  const [phoneOpen, setPhoneOpen] = useState<Set<ColumnKey>>(() => {
    const first = DECISION_COLUMNS.find((k) => groupByDecision(rows)[k].length > 0);
    return new Set(first ? [first] : []);
  });
  const dragged = draggingId ? rows.find((r) => r.id === draggingId) ?? null : null;
  // Decision 3: Passed and every empty column are rails until opened.
  const isCollapsed = (k: ColumnKey) => (COLLAPSED_BY_DEFAULT.includes(k) || grouped[k].length === 0) && !expanded.has(k);
  const toggle = (k: ColumnKey) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  // JC-MP-C: hovering a dragged card over a rail for 500 ms opens it; the drag closes those again.
  const springRef = useRef<{ key: ColumnKey; t: ReturnType<typeof setTimeout> } | null>(null);
  const springOpened = useRef(new Set<ColumnKey>());
  const clearSpring = () => {
    if (springRef.current) clearTimeout(springRef.current.t);
    springRef.current = null;
  };
  useEffect(() => clearSpring, []);
  const endDrag = (droppedOn?: ColumnKey) => {
    clearSpring();
    const opened = springOpened.current;
    springOpened.current = new Set();
    if (opened.size) {
      setExpanded((cur) => {
        const next = new Set(cur);
        // Keep the column the card was dropped on (it is no longer empty); Passed closes again (JC-MB-G).
        for (const k of opened) if (k !== droppedOn || COLLAPSED_BY_DEFAULT.includes(k)) next.delete(k);
        return next;
      });
    }
    setDraggingId(null);
    setDropColumn(null);
  };

  function renderCard(m: MemoRow, desktop: boolean) {
    return (
      <MemoBoardCard
        key={m.id}
        memo={m}
        me={me}
        showOwner={showOwner}
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
        onDragEnd={desktop ? () => endDrag() : undefined}
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
      onDragEnter: (e: React.DragEvent) => {
        if (!accepts || !isCollapsed(k) || springRef.current?.key === k) return;
        e.preventDefault();
        clearSpring();
        springRef.current = {
          key: k,
          t: setTimeout(() => {
            springOpened.current.add(k);
            setExpanded((cur) => new Set(cur).add(k));
            springRef.current = null;
          }, 500),
        };
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropColumn((cur) => (cur === k ? null : cur));
          if (springRef.current?.key === k) clearSpring();
        }
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = draggingId;
        endDrag(k);
        if (id && accepts) onMove(id, k);
      },
    };
  }
  const ring = (k: ColumnKey) => (dropColumn === k ? { boxShadow: `inset 0 0 0 1.5px ${TONES[COLUMN_TONE[k]].dot}` } : undefined);

  return (
    <>
      {/* Desktop: a row of columns. Passed and empty columns are narrow rails until opened. */}
      <div className="hidden gap-4 overflow-x-auto pb-2 md:flex">
        {DECISION_COLUMNS.map((k) => {
          const cards = grouped[k];
          const tone = COLUMN_TONE[k];
          // JC-MP-B: the line sits where the card will land (sorted by updatedAt, a move keeps it).
          const landAt = dragged && dropColumn === k && columnOf(dragged.decision) !== k ? landingIndex(cards, dragged) : null;
          const line = <div aria-hidden className="h-0.5 shrink-0 bg-sky" />;
          if (isCollapsed(k)) {
            return (
              <button
                key={k}
                type="button"
                aria-expanded={false}
                aria-label={`Show ${COLUMN_LABELS[k]}, ${countLabel(cards.length)}`}
                title={cards.length ? `Show ${cards.length} ${COLUMN_LABELS[k].toLowerCase()}` : `${COLUMN_LABELS[k]}: no memos`}
                onClick={() => toggle(k)}
                style={ring(k)}
                className="flex w-12 shrink-0 flex-col items-center gap-2 self-start border border-border bg-well px-1 py-3 transition-shadow hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...dropProps(k)}
              >
                <ChevronsRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
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
                {(COLLAPSED_BY_DEFAULT.includes(k) || cards.length === 0) && (
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
              <div
                style={ring(k)}
                className={cn(
                  "flex min-h-24 flex-1 flex-col gap-2 bg-well p-2 transition-shadow md:max-h-[70vh] md:overflow-y-auto",
                  dragged && columnOf(dragged.decision) === k && "opacity-60"
                )}
                {...dropProps(k)}
              >
                {cards.map((m, i) => (
                  <Fragment key={m.id}>
                    {landAt === i && line}
                    {renderCard(m, true)}
                  </Fragment>
                ))}
                {landAt !== null && landAt >= cards.length && line}
                {cards.length === 0 && (
                  <p className="py-5 text-center text-xs text-muted-foreground">
                    {dragged && dropColumn === k ? "Drop a memo here" : "No memos here"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Phone: stacked sections, no drag. The first non-empty section starts open. */}
      <div className="space-y-3 md:hidden">
        {DECISION_COLUMNS.map((k) => (
          <details
            key={k}
            open={phoneOpen.has(k)}
            onToggle={(e) => {
              const open = (e.currentTarget as HTMLDetailsElement).open;
              setPhoneOpen((cur) => {
                if (cur.has(k) === open) return cur;
                const next = new Set(cur);
                if (open) next.add(k);
                else next.delete(k);
                return next;
              });
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
              {phoneOpen.has(k) && grouped[k].map((m) => renderCard(m, false))}
              {grouped[k].length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No memos here</p>}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
