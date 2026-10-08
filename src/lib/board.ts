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

/** Splits a trailing "— Name" suffix off a todo's text. */
export function splitOwnerSuffix(text: string): { title: string; ownerRaw: string | null } {
  const t = text.trim();
  const m = t.match(/^(.*\S)\s+[—–]\s+([^—–]{1,80})$/);
  if (!m) return { title: t, ownerRaw: null };
  return { title: m[1].trim(), ownerRaw: m[2].trim() || null };
}
