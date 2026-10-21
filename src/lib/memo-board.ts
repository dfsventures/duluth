// Part 43 (WS142). Pure helpers for the memo board on /admin/memos. No React, no DB.
import { MEMO_DECISIONS, MEMO_DECISION_LABELS, type MemoDecision } from "@/lib/memos";
import type { Tone } from "@/lib/status-tone";

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
