// UI overhaul phase 3 (docs/design/app-ui-overhaul.md, 6.2): the pure logic
// behind <DataTable>. No React, no DOM, no DB, so it is unit-tested directly.
//
// State lives in the URL: ?q=<text>&filter=<chip key>&sort=<key> (prefix "-" for
// descending). Anything equal to the table's default is omitted, so a clean
// table has a clean URL.

export type SortDir = "asc" | "desc";

export interface TableState {
  q: string;
  /** Filter chip key; "all" is the unfiltered default. */
  filter: string;
  sort: string;
  dir: SortDir;
}

export interface TableStateOptions {
  sortKeys: readonly string[];
  filterKeys: readonly string[];
  defaultSort: { key: string; dir: SortDir };
  defaultFilter?: string;
}

export type SortValue = number | string | null | undefined;

/** Anything with a `get` (URLSearchParams, Next's ReadonlyURLSearchParams). */
interface ParamsLike {
  get(name: string): string | null;
}

/**
 * Nulls always sort last, whichever way the column is sorted, so flipping the
 * direction does not make blank cells jump to the top.
 */
export function compareValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const result =
    typeof a === "string" && typeof b === "string"
      ? a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })
      : Number(a) - Number(b);
  return dir === "asc" ? result : -result;
}

export function sortRows<T>(rows: readonly T[], getValue: (row: T) => SortValue, dir: SortDir): T[] {
  // Array.prototype.sort is stable, so equal rows keep their incoming order.
  return [...rows].sort((x, y) => compareValues(getValue(x), getValue(y), dir));
}

/** Case-insensitive "every word appears somewhere in the haystacks". */
export function matchesQuery(haystacks: readonly (string | null | undefined)[], q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = haystacks
    .filter((h): h is string => typeof h === "string")
    .join(" ")
    .toLowerCase();
  return words.every((w) => text.includes(w));
}

export function parseTableState(params: ParamsLike, opts: TableStateOptions): TableState {
  const defaultFilter = opts.defaultFilter ?? "all";
  const q = (params.get("q") ?? "").slice(0, 200);

  const rawFilter = params.get("filter");
  const filter = rawFilter && opts.filterKeys.includes(rawFilter) ? rawFilter : defaultFilter;

  const rawSort = params.get("sort") ?? "";
  const desc = rawSort.startsWith("-");
  const key = desc ? rawSort.slice(1) : rawSort;
  if (key && opts.sortKeys.includes(key)) {
    return { q, filter, sort: key, dir: desc ? "desc" : "asc" };
  }
  return { q, filter, sort: opts.defaultSort.key, dir: opts.defaultSort.dir };
}

/** Query string ("" or "?a=b") with every default value left out. */
export function buildTableQuery(
  state: TableState,
  opts: Pick<TableStateOptions, "defaultSort" | "defaultFilter">,
  base?: URLSearchParams
): string {
  const params = new URLSearchParams(base ? base.toString() : "");
  for (const k of ["q", "filter", "sort"]) params.delete(k);

  if (state.q.trim()) params.set("q", state.q);
  if (state.filter !== (opts.defaultFilter ?? "all")) params.set("filter", state.filter);
  if (state.sort !== opts.defaultSort.key || state.dir !== opts.defaultSort.dir) {
    params.set("sort", `${state.dir === "desc" ? "-" : ""}${state.sort}`);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Clicking a header: same column flips direction; a new column uses its natural first direction. */
export function nextSort(
  current: Pick<TableState, "sort" | "dir">,
  key: string,
  firstDir: SortDir = "asc"
): Pick<TableState, "sort" | "dir"> {
  if (current.sort === key) return { sort: key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { sort: key, dir: firstDir };
}

export function ariaSort(active: boolean, dir: SortDir): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export interface FilterChipDef<T> {
  key: string;
  label: string;
  /** Omit for the "all" chip. */
  test?: (row: T) => boolean;
}

/** Live count per chip, against the rows that already pass the text search. */
export function chipCounts<T>(rows: readonly T[], chips: readonly FilterChipDef<T>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of chips) out[c.key] = c.test ? rows.filter(c.test).length : rows.length;
  return out;
}

/** "3 of 10 companies" or "10 companies". */
export function resultSummary(shown: number, total: number, noun: string, pluralNoun?: string): string {
  const word = shown === 1 && total === 1 ? noun : (pluralNoun ?? `${noun}s`);
  return shown === total ? `${total} ${word}` : `${shown} of ${total} ${pluralNoun ?? `${noun}s`}`;
}

// ── Group-by and column visibility (UI overhaul phase 8) ─────────────────

export interface RowGroup<T> {
  id: string;
  label: string;
  rows: T[];
}

/**
 * Splits already-sorted rows into groups. Groups are ordered by label (A to Z,
 * numbers natural); rows inside a group keep the incoming order, so the table's
 * own sort still applies within each group.
 */
export function groupRows<T>(rows: readonly T[], getGroup: (row: T) => { id: string; label: string }): RowGroup<T>[] {
  const byId = new Map<string, RowGroup<T>>();
  for (const row of rows) {
    const g = getGroup(row);
    const existing = byId.get(g.id);
    if (existing) existing.rows.push(row);
    else byId.set(g.id, { id: g.id, label: g.label, rows: [row] });
  }
  return [...byId.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true })
  );
}

/** Hidden-column keys from storage: JSON string array, filtered to columns that exist. Garbage becomes []. */
export function parseHiddenColumns(raw: string | null | undefined, validKeys: readonly string[]): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k): k is string => typeof k === "string" && validKeys.includes(k));
  } catch {
    return [];
  }
}

export function toggleHidden(hidden: readonly string[], key: string): string[] {
  return hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
}
