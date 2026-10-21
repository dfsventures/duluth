// Part 43 (WS142). Pure helpers for the memo board on /admin/memos. No React, no DB.
import { MEMO_DECISIONS, MEMO_DECISION_LABELS, type MemoDecision } from "@/lib/memos";
import type { Tone } from "@/lib/status-tone";
import { relativeTime } from "@/lib/relative-time";

export type ColumnKey = MemoDecision | "NONE";
/** Owner decision 2; "NONE" last (JC-MB-E). */
export const DECISION_COLUMNS: readonly ColumnKey[] = [...MEMO_DECISIONS, "NONE"];
export const COLUMN_LABELS: Record<ColumnKey, string> = { ...MEMO_DECISION_LABELS, NONE: "Unsorted" };
/** Collapsed on first render (decision 2). */
export const COLLAPSED_BY_DEFAULT: readonly ColumnKey[] = ["PASSED"];
/** Header dot / ring colour. Decorative. Never clay (status-tone.ts rule: clay = needs intervention). */
export const COLUMN_TONE: Record<ColumnKey, Tone> = {
  IN_PROGRESS: "sky",
  MEMO: "sand",
  INVESTED: "sage",
  LATER: "amber",
  PASSED: "stone",
  NONE: "stone",
};

export const columnOf = (d: MemoDecision | null): ColumnKey => d ?? "NONE";
export const decisionOf = (k: ColumnKey): MemoDecision | null => (k === "NONE" ? null : k);

/** Rows grouped into every column (empty ones included), each sorted by updatedAt desc. */
export function groupByDecision<T extends { decision: MemoDecision | null; updatedAt: string }>(rows: readonly T[]): Record<ColumnKey, T[]> {
  const out = Object.fromEntries(DECISION_COLUMNS.map((k) => [k, [] as T[]])) as Record<ColumnKey, T[]>;
  for (const r of rows) out[columnOf(r.decision)].push(r);
  for (const k of DECISION_COLUMNS) out[k].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return out;
}

export type MemoView = "board" | "list";
const isView = (v: string | null): v is MemoView => v === "board" || v === "list";
/** JC-MB-A: URL param, else stored value, else board. Unknown values are ignored. */
export function resolveView(param: string | null, stored: string | null): MemoView {
  if (isView(param)) return param;
  if (isView(stored)) return stored;
  return "board";
}

/** Optimistic local update: the row's decision (and version, once the server answers). */
export function applyDecision<T extends { id: string; decision: MemoDecision | null; version: number }>(
  rows: readonly T[],
  id: string,
  decision: MemoDecision | null,
  version?: number
): T[] {
  return rows.map((r) => (r.id === id ? { ...r, decision, ...(version !== undefined ? { version } : {}) } : r));
}

/** Alt+Left/Right on a card: the neighbouring column, or null at the edges. */
export function adjacentColumn(k: ColumnKey, dir: "left" | "right"): ColumnKey | null {
  const i = DECISION_COLUMNS.indexOf(k) + (dir === "left" ? -1 : 1);
  return DECISION_COLUMNS[i] ?? null;
}

// Part 44 (WS145.1)

/** Decision 4. Stages where a quiet memo needs a nudge. */
export const IDLE_STAGES: readonly MemoDecision[] = ["IN_PROGRESS", "MEMO"];
export const IDLE_DAYS = 14;
const DAY = 86_400_000;

export function isIdle(m: { decision: MemoDecision | null; updatedAt: string }, now = new Date()): boolean {
  if (!m.decision || !IDLE_STAGES.includes(m.decision)) return false;
  return now.getTime() - new Date(m.updatedAt).getTime() >= IDLE_DAYS * DAY;
}

/** JC-MP-A. Relative up to 30 days, then "Aug 13" (year added when it is not this year). */
export function boardTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const days = Math.floor((now.getTime() - then.getTime()) / DAY);
  if (days < 14) return relativeTime(then, now);
  if (days <= 30) return `${Math.floor(days / 7)} wk ago`;
  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Decision 2: hide the company line when it repeats the title. */
export const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Decision 2: "AI · Payments" plus the hidden count. */
export function tagLine(tags: readonly string[], shown = 2): { text: string; more: number } {
  return { text: tags.slice(0, shown).join(" · "), more: Math.max(0, tags.length - shown) };
}

/** Columns a card can move to (menu items on desktop and phone). */
export const moveTargets = (here: ColumnKey): ColumnKey[] => DECISION_COLUMNS.filter((k) => k !== here);

/** JC-MP-B. Where a dropped card lands in a column sorted by updatedAt desc. */
export function landingIndex(cards: readonly { id: string; updatedAt: string }[], dragged: { id: string; updatedAt: string }): number {
  return cards.filter((c) => c.id !== dragged.id && c.updatedAt > dragged.updatedAt).length;
}

/** Decision 5: the summary line. Counts are over the rows the board is showing. */
export function summaryCounts<T extends { status: string; decision: MemoDecision | null; updatedAt: string }>(rows: readonly T[], now = new Date()) {
  return { total: rows.length, inReview: rows.filter((r) => r.status === "IN_REVIEW").length, idle: rows.filter((r) => isIdle(r, now)).length };
}
