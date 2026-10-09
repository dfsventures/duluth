import type { BoardCardData, BoardPayload } from "@/components/admin/board/types";

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
