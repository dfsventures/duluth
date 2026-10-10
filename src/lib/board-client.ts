import type { BoardCardData, BoardPayload } from "@/components/admin/board/types";
import { BOARD_STATUSES, type BoardStatus } from "@/lib/board";

/**
 * Pure helpers for the Team Board page (Part 37 UI fixes, fix 3).
 * Kept free of React so the stale-refresh cases can be unit tested.
 */

/** Monotonic token: only the most recent request may write state. */
export function createSequencer() {
  let current = 0;
  return {
    /** Start a new request; returns its token and invalidates all earlier ones. */
    next: () => ++current,
    /** Invalidate every in-flight request without starting one (e.g. optimistic move). */
    invalidate: () => {
      current++;
    },
    isCurrent: (token: number) => token === current,
  };
}

/** Local recount of flagged cards (archived cards never count). */
export function countNeedsReview(cards: BoardCardData[]): number {
  return cards.filter((c) => c.needsReview && !c.archivedAt).length;
}

/**
 * Fold a card returned by create / edit / resolve / archive into the payload so
 * the board, the "!" icon and the banner count update before the background
 * reload lands. Archived cards leave the board; unknown cards are appended.
 */
export function applyCardToPayload(cur: BoardPayload, saved: BoardCardData): BoardPayload {
  let cards: BoardCardData[];
  if (saved.archivedAt) {
    cards = cur.cards.filter((c) => c.id !== saved.id);
  } else if (cur.cards.some((c) => c.id === saved.id)) {
    cards = cur.cards.map((c) => (c.id === saved.id ? { ...c, ...saved } : c));
  } else {
    cards = [...cur.cards, saved];
  }
  return { ...cur, cards, needsReviewCount: countNeedsReview(cards) };
}

// ── Phase 6 (UI overhaul): drag placement, Undo and keyboard moves ──────────
//
// The Part 37 move contract is unchanged: `beforeId` is the card directly
// ABOVE the landing spot, `afterId` the card directly BELOW, neither = end of
// the column. These helpers turn a pointer position or a key press into that.


/**
 * Where a card dropped at height `y` should land among the cards of a column.
 * `mids` are the vertical midpoints of the column's cards (excluding the one
 * being dragged), top to bottom. Returns an index 0..mids.length: the new
 * card's position in that list (mids.length = the end).
 */
export function insertionIndex(mids: readonly number[], y: number): number {
  for (let i = 0; i < mids.length; i++) if (y < mids[i]) return i;
  return mids.length;
}

export interface Neighbours {
  beforeId?: string;
  afterId?: string;
}

/**
 * The move contract for landing at `index` in `ids` (the column without the
 * moved card). Card above wins when there is one; at the top, the card below;
 * an empty column or the end of one sends neither beyond "above" (end = the
 * last card is the card above, which the server resolves to the end).
 */
export function neighboursForIndex(ids: readonly string[], index: number): Neighbours {
  const i = Math.max(0, Math.min(index, ids.length));
  if (i > 0) return { beforeId: ids[i - 1] };
  if (ids.length > 0) return { afterId: ids[0] };
  return {};
}

/** Dropping a card exactly where it already is changes nothing. */
export function isNoopMove(
  column: readonly { id: string }[],
  cardId: string,
  status: BoardStatus,
  currentStatus: BoardStatus,
  index: number
): boolean {
  if (status !== currentStatus) return false;
  const without = column.filter((c) => c.id !== cardId);
  const at = column.findIndex((c) => c.id === cardId);
  return at === Math.max(0, Math.min(index, without.length));
}

/**
 * Where Undo puts a moved card back: its old column, directly under its old
 * upper neighbour (or above its old lower one; or the end of an empty column).
 * `columns` must be the ordered, UNFILTERED columns from BEFORE the move.
 */
export function undoTarget(
  columns: Record<BoardStatus, { id: string }[]>,
  cardId: string
): ({ status: BoardStatus } & Neighbours) | null {
  for (const status of BOARD_STATUSES) {
    const col = columns[status];
    const i = col.findIndex((c) => c.id === cardId);
    if (i === -1) continue;
    if (i > 0) return { status, beforeId: col[i - 1].id };
    if (col.length > 1) return { status, afterId: col[1].id };
    return { status };
  }
  return null;
}

/** The column a left/right key press moves to; null at the edges. */
export function adjacentStatus(status: BoardStatus, dir: "left" | "right"): BoardStatus | null {
  const i = BOARD_STATUSES.indexOf(status);
  const next = dir === "left" ? i - 1 : i + 1;
  return BOARD_STATUSES[next] ?? null;
}

/** Initials for an owner tile: first letters of up to two words. */
export function initials(label: string | null | undefined): string {
  const words = (label ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
