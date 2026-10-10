"use client";

// UI overhaul phase 3 (docs/design/app-ui-overhaul.md, 6.2): the one table
// primitive for admin lists. Pure logic (sort, search, URL state) lives in
// src/lib/data-table.ts and is unit-tested; this file is the presentation.
//
// What it gives a page for free: search, filter chips with live counts, sortable
// columns (aria-sort), sort/filter/search in the URL, whole-row navigation with
// a real link in the first cell, row actions revealed on hover or focus (always
// visible on touch), loading / error / empty / filtered-empty states, and a
// two-line list layout below md.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isTypingTarget } from "@/lib/shortcuts";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  ariaSort,
  buildTableQuery,
  chipCounts,
  matchesQuery,
  nextSort,
  parseTableState,
  resultSummary,
  sortRows,
  type FilterChipDef,
  type SortDir,
  type SortValue,
  type TableState,
} from "@/lib/data-table";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Presence makes the column sortable. */
  sortValue?: (row: T) => SortValue;
  /** Direction on the first click. Text A to Z, numbers and dates largest first. */
  firstDir?: SortDir;
  /** "num" right-aligns and sets tabular figures. */
  align?: "num";
  className?: string;
  /** Keep this column visible while the table scrolls sideways (first column only). */
  sticky?: boolean;
  /** Below md the row becomes a list item: the first column is the title. */
  mobile?: "badge" | "meta";
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  /** Names the table for assistive tech ("Companies"). */
  label: string;
  /** Singular and plural nouns for the result count. */
  noun: string;
  pluralNoun?: string;

  /** Whole-row navigation. The first cell gets a real link (keyboard, middle-click). */
  rowHref?: (row: T) => string;
  /** Buttons shown at the row's end, revealed on hover and on focus. */
  rowActions?: (row: T) => React.ReactNode;
  /** Accessible name for the actions column header. */
  actionsLabel?: string;

  searchText?: (row: T) => (string | null | undefined)[];
  searchPlaceholder?: string;
  chips?: FilterChipDef<T>[];
  /** Extra controls (a fund select, say) after the chips. */
  toolbarExtra?: React.ReactNode;

  defaultSort: { key: string; dir: SortDir };

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Shown instead of the table when `rows` is empty (the "none yet" state). */
  empty: React.ReactNode;
  /** Min-width for the table so it scrolls sideways instead of squashing. */
  minWidth?: number;

  /** Keep search/filter/sort in the URL. Turn off when a page holds two tables. */
  urlState?: boolean;
  /** Called with the rows currently shown (after search/filter/sort). */
  onVisibleRowsChange?: (rows: T[]) => void;
  className?: string;
}

export function DataTable<T>(props: DataTableProps<T>) {
  // useSearchParams needs a Suspense boundary under static prerendering.
  return (
    <Suspense fallback={<TableSkeleton rows={6} cols={Math.min(props.columns.length, 5)} />}>
      <DataTableInner {...props} />
    </Suspense>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown aria-hidden="true" className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? (
    <ChevronUp aria-hidden="true" className="h-3 w-3" />
  ) : (
    <ChevronDown aria-hidden="true" className="h-3 w-3" />
  );
}


function DataTableInner<T>({
  rows,
  columns,
  rowKey,
  label,
  noun,
  pluralNoun,
  rowHref,
  rowActions,
  actionsLabel = "Actions",
  searchText,
  searchPlaceholder,
  chips,
  toolbarExtra,
  defaultSort,
  loading,
  error,
  onRetry,
  empty,
  minWidth,
  urlState = true,
  onVisibleRowsChange,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sortKeys = useMemo(() => columns.filter((c) => c.sortValue).map((c) => c.key), [columns]);
  const filterKeys = useMemo(() => ["all", ...(chips ?? []).map((c) => c.key)], [chips]);
  const stateOpts = useMemo(
    () => ({ sortKeys, filterKeys, defaultSort, defaultFilter: "all" }),
    [sortKeys, filterKeys, defaultSort]
  );

  // URL-backed state, or plain local state when urlState is off.
  const [localState, setLocalState] = useState<TableState>({
    q: "",
    filter: "all",
    sort: defaultSort.key,
    dir: defaultSort.dir,
  });
  const urlParsed = useMemo(() => parseTableState(searchParams, stateOpts), [searchParams, stateOpts]);
  const state = urlState ? urlParsed : localState;

  const writeState = useCallback(
    (next: TableState) => {
      if (!urlState) {
        setLocalState(next);
        return;
      }
      const qs = buildTableQuery(next, stateOpts, new URLSearchParams(searchParams.toString()));
      router.replace(`${pathname}${qs}`, { scroll: false });
    },
    [urlState, stateOpts, searchParams, router, pathname]
  );

  // The text box keeps its own value so typing never lags behind the URL.
  const [qInput, setQInput] = useState(state.q);
  const lastWrittenQ = useRef(state.q);
  useEffect(() => {
    // Back/forward changed the URL under us: follow it.
    if (state.q !== lastWrittenQ.current) {
      lastWrittenQ.current = state.q;
      setQInput(state.q);
    }
  }, [state.q]);
  useEffect(() => {
    if (qInput === state.q) return;
    const t = setTimeout(() => {
      lastWrittenQ.current = qInput;
      writeState({ ...state, q: qInput });
    }, urlState ? 250 : 0);
    return () => clearTimeout(t);
  }, [qInput, state, writeState, urlState]);

  const searchRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      if (!searchRef.current || searchRef.current.offsetParent === null) return;
      e.preventDefault();
      searchRef.current.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // j / k move through rows, Enter opens one (spec 6.9). Works when focus is in
  // this table, or on the page body for the first table on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (e.key !== "j" && e.key !== "k" && e.key !== "Enter") return;
      const wrap = wrapRef.current;
      if (!wrap || wrap.offsetParent === null) return;
      const active = document.activeElement;
      const inside = Boolean(active && wrap.contains(active));
      const onBody = !active || active === document.body;
      if (!inside && !(onBody && document.querySelector("[data-datatable]") === wrap)) return;
      if (!inside && isTypingTarget(active)) return;
      if (inside && isTypingTarget(active)) return;

      const rowEls = Array.from(wrap.querySelectorAll<HTMLElement>("tbody tr[data-row]")).filter(
        (el) => el.offsetParent !== null
      );
      if (rowEls.length === 0) return;
      const current = active ? rowEls.findIndex((r) => r === active || r.contains(active)) : -1;

      if (e.key === "Enter") {
        // Only act on a row that has focus itself; links and buttons keep Enter.
        if (current === -1 || active !== rowEls[current]) return;
        const a = rowEls[current].querySelector<HTMLAnchorElement>("a[href]");
        if (a) {
          e.preventDefault();
          a.click();
        }
        return;
      }
      e.preventDefault();
      const next = e.key === "j" ? Math.min(current + 1, rowEls.length - 1) : Math.max(current - 1, 0);
      rowEls[current === -1 ? 0 : next].focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const searched = useMemo(
    () => (searchText ? rows.filter((r) => matchesQuery(searchText(r), state.q)) : rows),
    [rows, searchText, state.q]
  );
  const counts = useMemo(
    () => chipCounts(searched, [{ key: "all", label: "All" }, ...(chips ?? [])]),
    [searched, chips]
  );
  const visible = useMemo(() => {
    const chip = chips?.find((c) => c.key === state.filter);
    const filtered = chip?.test ? searched.filter(chip.test) : searched;
    const col = columns.find((c) => c.key === state.sort);
    return col?.sortValue ? sortRows(filtered, col.sortValue, state.dir) : filtered;
  }, [searched, chips, state.filter, state.sort, state.dir, columns]);

  // Only report real changes, so a parent that re-creates `columns` every render
  // cannot loop (visible gets a new identity each time, with identical contents).
  const lastReported = useRef<T[] | null>(null);
  useEffect(() => {
    const prev = lastReported.current;
    if (prev && prev.length === visible.length && prev.every((r, i) => r === visible[i])) return;
    lastReported.current = visible;
    onVisibleRowsChange?.(visible);
  }, [visible, onVisibleRowsChange]);

  const hasToolbar = Boolean(searchText || (chips && chips.length > 0) || toolbarExtra);
  const filtersActive = state.q.trim() !== "" || state.filter !== "all";

  if (loading) {
    return <TableSkeleton rows={6} cols={Math.min(columns.length, 5)} className={className} />;
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center border border-border bg-card py-12 text-center">
        <AlertCircle aria-hidden="true" className="mb-2 h-7 w-7 text-tone-clay-ink" />
        <p className="text-sm text-foreground">{error}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (rows.length === 0) return <>{empty}</>;

  function clearFilters() {
    setQInput("");
    lastWrittenQ.current = "";
    writeState({ ...state, q: "", filter: "all" });
  }

  function onHeaderSort(col: DataTableColumn<T>) {
    const s = nextSort(state, col.key, col.firstDir ?? (col.align === "num" ? "desc" : "asc"));
    writeState({ ...state, ...s });
  }

  const titleCol = columns[0];
  const badgeCols = columns.filter((c) => c.mobile === "badge");
  const metaCols = columns.filter((c) => c.mobile === "meta");

  function openRow(e: React.MouseEvent, href: string) {
    if (e.defaultPrevented || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label,summary,[role=button]")) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  return (
    <div ref={wrapRef} data-datatable="" className={className}>
      {hasToolbar && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchText && (
            <div className="relative min-w-[200px] max-w-sm flex-1 basis-56">
              <label htmlFor={`dt-search-${label}`} className="sr-only">
                {searchPlaceholder ?? `Filter ${label.toLowerCase()}`}
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id={`dt-search-${label}`}
                ref={searchRef}
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (qInput) setQInput("");
                    else (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder={searchPlaceholder ?? `Filter ${label.toLowerCase()}`}
                autoComplete="off"
                className="h-8 w-full rounded-sm border border-input bg-card pl-8 pr-8 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:block"
              >
                /
              </kbd>
            </div>
          )}
          {chips && chips.length > 0 && (
            <div role="group" aria-label={`Filter ${label.toLowerCase()}`} className="flex flex-wrap gap-1.5">
              {[{ key: "all", label: "All" } as FilterChipDef<T>, ...chips].map((c) => {
                const pressed = state.filter === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => writeState({ ...state, filter: c.key })}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      pressed
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-secondary hover:border-[var(--color-border-hover)] hover:text-foreground"
                    )}
                  >
                    {c.label}
                    <span className={cn("num font-mono text-[11px]", pressed ? "opacity-80" : "text-muted-foreground")}>
                      {counts[c.key] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {toolbarExtra}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-border bg-card py-12 text-center">
          <p className="text-sm font-medium text-foreground">No {pluralNoun ?? `${noun}s`} match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.q.trim() ? `Nothing matches "${state.q.trim()}"` : "Nothing matches this filter"}
            {state.q.trim() && state.filter !== "all" ? " with this filter" : ""}.
          </p>
          {filtersActive && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="table-scroll-fade hidden overflow-x-auto border border-border bg-card md:block">
            <table className="w-full text-[13px]" style={minWidth ? { minWidth } : undefined}>
              <caption className="sr-only">{label}</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  {columns.map((c, i) => {
                    const sortable = Boolean(c.sortValue);
                    const active = state.sort === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={sortable ? ariaSort(active, state.dir) : undefined}
                        className={cn(
                          "h-[34px] whitespace-nowrap px-3 font-mono text-label font-semibold uppercase tracking-label text-muted-foreground",
                          c.align === "num" && "text-right",
                          c.sticky && i === 0 && "sticky left-0 z-10 bg-card",
                          c.className
                        )}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => onHeaderSort(c)}
                            className={cn(
                              "inline-flex items-center gap-1 uppercase tracking-label hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              active && "text-foreground",
                              c.align === "num" && "flex-row-reverse"
                            )}
                          >
                            {c.header}
                            <SortIcon active={active} dir={state.dir} />
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                  {rowActions && (
                    <th scope="col" className="w-px px-3">
                      <span className="sr-only">{actionsLabel}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const href = rowHref?.(row);
                  return (
                    <tr
                      key={rowKey(row)}
                      data-row=""
                      tabIndex={-1}
                      onClick={href ? (e) => openRow(e, href) : undefined}
                      className={cn(
                        "group h-11 border-b border-row-divider outline-none transition-colors last:border-0 hover:bg-row-hover focus-within:bg-row-hover focus-visible:bg-row-hover focus-visible:shadow-[inset_2px_0_0_var(--color-accent)]",
                        href && "cursor-pointer"
                      )}
                    >
                      {columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={cn(
                            "px-3 py-1",
                            c.align === "num" ? "num whitespace-nowrap" : "",
                            i === 0 && "font-medium",
                            c.sticky && i === 0 && "sticky left-0 z-[1] bg-card group-hover:bg-row-hover",
                            c.className
                          )}
                        >
                          {i === 0 && href ? (
                            <Link
                              href={href}
                              className="inline-flex items-center hover:underline focus-visible:underline focus-visible:outline-none"
                            >
                              {c.cell(row)}
                            </Link>
                          ) : (
                            c.cell(row)
                          )}
                        </td>
                      ))}
                      {rowActions && (
                        <td className="px-3 py-1 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                            {rowActions(row)}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list: title + badge, then the key facts. */}
          <ul aria-label={label} className="divide-y divide-row-divider border border-border bg-card md:hidden">
            {visible.map((row) => {
              const href = rowHref?.(row);
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-medium">{titleCol.cell(row)}</span>
                    {badgeCols.length > 0 && (
                      <span className="num shrink-0 text-[13px]">{badgeCols.map((c) => c.cell(row))}</span>
                    )}
                  </div>
                  {metaCols.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {metaCols.map((c) => (
                        <span key={c.key}>{c.cell(row)}</span>
                      ))}
                    </div>
                  )}
                </>
              );
              return (
                <li key={rowKey(row)} className="relative px-4 py-3 text-sm">
                  {href ? (
                    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                  {rowActions && <div className="mt-2 flex items-center gap-1">{rowActions(row)}</div>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p aria-live="polite" className="mt-2 font-mono text-[11px] text-muted-foreground">
        {resultSummary(visible.length, rows.length, noun, pluralNoun)}
      </p>
    </div>
  );
}
