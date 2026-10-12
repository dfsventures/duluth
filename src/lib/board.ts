// Part 37 (WS106.1) — constants and pure helpers for the team board.
// Client-safe: no db, no server imports.

export const BOARD_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

/** Q99-i: Done cards stay visible on the board for this many days. */
export const DONE_VISIBLE_DAYS = 14;

/** Part 38 (JC-MO-C): most owners (resolved + unmatched) one card may carry. */
export const MAX_OWNERS_PER_CARD = 5;

/** Gap used when appending to / prepending to a column. */
export const POSITION_STEP = 1024;

export function isBoardStatus(s: unknown): s is BoardStatus {
  return typeof s === "string" && (BOARD_STATUSES as readonly string[]).includes(s);
}

/**
 * Fractional ordering. `before` is the position of the card that will sit
 * immediately ABOVE the new slot (lower number), `after` the one immediately
 * BELOW (higher number). Either may be undefined at the edges of a column.
 */
export function positionBetween(before?: number, after?: number): number {
  const hasBefore = typeof before === "number";
  const hasAfter = typeof after === "number";
  if (hasBefore && hasAfter) return (before + after) / 2;
  if (hasBefore) return before + POSITION_STEP;
  if (hasAfter) return after - POSITION_STEP;
  return POSITION_STEP;
}

/** True when two neighbouring positions are too close to split again. */
export function needsRenormalize(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** Cutoff date: Done cards completed before this are hidden from the board. */
export function doneCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Parses a date-only string (YYYY-MM-DD) to 00:00 UTC. Returns `undefined`
 * for an invalid value, `null` for an explicit clear (null or empty string).
 */
export function parseDueDate(v: unknown): Date | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const MAX_TITLE_LENGTH = 300;
export const MAX_NOTES_LENGTH = 5000;
export const MAX_NAME_LENGTH = 120;

/**
 * Part 38: owner input for POST/PATCH. `ownerIds` (array) or legacy `ownerId`
 * (string|null); not both. `ownerIds: undefined` means the field was absent.
 */
export function parseOwnerInput(
  b: Record<string, unknown>
): { ok: true; ownerIds: string[] | undefined } | { ok: false; error: string } {
  const hasArr = "ownerIds" in b;
  const hasOne = "ownerId" in b;
  if (hasArr && hasOne) return { ok: false, error: "Send ownerIds or ownerId, not both" };
  if (hasOne) {
    if (b.ownerId === null || b.ownerId === "") return { ok: true, ownerIds: [] };
    return typeof b.ownerId === "string"
      ? { ok: true, ownerIds: [b.ownerId] }
      : { ok: false, error: "Unknown owner" };
  }
  if (!hasArr) return { ok: true, ownerIds: undefined };
  if (!Array.isArray(b.ownerIds) || b.ownerIds.some((x) => typeof x !== "string" || !x)) {
    return { ok: false, error: "ownerIds must be an array of ids" };
  }
  const ids = [...new Set(b.ownerIds as string[])];
  if (ids.length > MAX_OWNERS_PER_CARD) {
    return { ok: false, error: `A card can have at most ${MAX_OWNERS_PER_CARD} owners` };
  }
  return { ok: true, ownerIds: ids };
}
