import { positionBetween, type BoardStatus } from "@/lib/board";

export interface BoardCardData {
  id: string;
  title: string;
  notes: string | null;
  status: BoardStatus;
  position: number;
  dueDate: string | null;
  projectId: string | null;
  ownerId: string | null;
  rawOwnerName: string | null;
  rawProjectName: string | null;
  needsReview: boolean;
  completedAt: string | null;
  archivedAt: string | null;
  updatedById: string | null;
  updatedAt: string;
}

export interface BoardPersonData {
  id: string;
  displayName: string;
  userId: string | null;
  label: string;
  archivedAt: string | null;
  aliases?: { id: string; normalized: string }[];
  cardCount?: number;
}

export interface BoardProjectData {
  id: string;
  name: string;
  archivedAt: string | null;
  aliases?: { id: string; normalized: string }[];
  cardCount?: number;
}

export interface BoardPayload {
  cards: BoardCardData[];
  projects: BoardProjectData[];
  people: BoardPersonData[];
  needsReviewCount: number;
}

/**
 * Mirrors moveCard() on the server so the optimistic reorder lands where the
 * server will put it. `column` is the target column WITHOUT the moved card,
 * sorted by position. `beforeId` = card directly above, `afterId` = directly below.
 */
export function localPosition(
  column: { id: string; position: number }[],
  beforeId?: string,
  afterId?: string
): number {
  let idx = column.length;
  if (beforeId) {
    const i = column.findIndex((c) => c.id === beforeId);
    if (i >= 0) idx = i + 1;
  } else if (afterId) {
    const i = column.findIndex((c) => c.id === afterId);
    if (i >= 0) idx = i;
  }
  return positionBetween(column[idx - 1]?.position, column[idx]?.position);
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Date-only strings are stored at 00:00 UTC; compare on the UTC date. */
export function isOverdue(due: string | null, status: BoardStatus): boolean {
  if (!due || status === "DONE") return false;
  return due.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

export function dueLabel(due: string): string {
  return new Date(due.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
