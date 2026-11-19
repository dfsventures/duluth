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

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, Columns3, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { isTypingTarget } from "@/lib/shortcuts";
import { useNewLook } from "@/lib/use-new-look";
import { stepCursor } from "@/lib/split-view";
import { TableSkeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { csvFilename, downloadCsv, toCsv, type CsvCell } from "@/lib/csv-export";
import {
  ariaSort,
  buildTableQuery,
  chipCounts,
  groupRows,
  matchesQuery,
  nextSort,
  parseHiddenColumns,
  parseTableState,
  resultSummary,
  sortRows,
  toggleHidden,
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
  /** Value written to the CSV export. Falls back to `sortValue`; columns with neither are left out. */
  exportValue?: (row: T) => CsvCell;
  /** Set false to keep the column out of the Columns menu. The first column is never hideable. */
  hideable?: boolean;
  /**
   * New look, list beside a pane (WS160): the column drops out when the list is narrower than
   * this many px (600 goes first, 480 next). Without it the column always shows. The first
   * column never drops. No effect under the old look.
   */
  dropBelow?: 600 | 480;
  /**
   * New look: every cell is one line and is cut with an ellipsis where it is too narrow. A cell that
   * renders plain text gets that text as its title automatically; set this for a cell that renders
   * markup (a chip, say) so the full text is still there on hover. No effect under the old look.
   */
  title?: (row: T) => string | null | undefined;
}

/** Group-by (spec 7, Deal Ledger): rows are grouped under a heading, with an optional subtotal row. */
export interface DataTableGroupBy<T> {
  options: { key: string; label: string; getGroup: (row: T) => { id: string; label: string } }[];
  /** Cells for the subtotal row, by column key. Columns left out are blank. */
  subtotal?: (rows: T[]) => Record<string, React.ReactNode>;
  /** Label in the first cell of the subtotal row. Default "Subtotal". */
  subtotalLabel?: string;
  /**
   * New look (WS161): always group by this option key, with no "Group by" select and nothing in the
   * URL. The groups stay in the order their first row appears (the rows arrive in the order that
   * means something).
   */
  fixed?: string;
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
  /** New look only: show the row actions all the time instead of on hover (small tables whose rows exist to be acted on). */
  actionsAlwaysVisible?: boolean;
  /** Extra classes per row, e.g. the row-removal animation. Applied to the table row and the mobile list item. */
  rowClassName?: (row: T) => string | undefined;

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
  /**
   * Turns on the Columns menu and remembers the choice in this browser under
   * this id. Without it the menu is not shown.
   */
  tableId?: string;
  /** Adds an Export CSV button: the rows shown (search, filter, sort) and the columns shown. */
  exportCsv?: { filename: string };
  groupBy?: DataTableGroupBy<T>;
  className?: string;

  // ── New look (PLAN-1, WS160). All of these are ignored under the old look. ──
  /**
   * Row height. "comfortable" (default) is 44px; "compact" is 36px, chosen per page for long
   * tables (never by the user).
   */
  density?: "comfortable" | "compact";
  /**
   * Turns the table into a list that opens records beside it. A click on a row (or its link),
   * and Enter on the cursor row, call this instead of navigating; `rowHref` stays the full page
   * (middle-click, and the `o` key). With the pane open, j and k call it for the next record.
   */
  onOpenRow?: (row: T) => void;
  /** Key of the record open in the pane. That row is marked, and j / k step from it. */
  openKey?: string | null;
  /** New look: keep the column headings for screen readers only (a list whose rows speak for themselves). */
  hideHeader?: boolean;
  /**
   * New look: below this many rows (default 8) the search box and filter chips are not drawn. Set 0 to
   * always show them. Rows are counted before any filter, so the bar never vanishes while in use.
   */
  minRowsForFilter?: number;
  /**
   * New look: one fixed layout for stacked tables, so their columns line up. One entry per shown
   * column, then one for the actions column when there is one (px number, CSS width, or null for the
   * flexible column). Nothing happens under the old look.
   */
  columnWidths?: (number | string | null)[];
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
  rowClassName,
  actionsLabel = "Actions",
  actionsAlwaysVisible,
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
  tableId,
  exportCsv,
  groupBy,
  className,
  density = "comfortable",
  onOpenRow,
  openKey = null,
  hideHeader,
  minRowsForFilter = 8,
  columnWidths,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // New look: false on the server and the first render, so the old markup is what hydrates.
  const v2 = useNewLook();
  const listMode = v2 && Boolean(onOpenRow);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  // The key handler is installed once; it reads the latest of these.
  const live = useRef({ listMode, onOpenRow, openKey, rowKey, rowHref, router, rows: [] as T[] });
  live.current.router = router;
  live.current.listMode = listMode;
  live.current.onOpenRow = onOpenRow;
  live.current.openKey = openKey;
  live.current.rowKey = rowKey;
  live.current.rowHref = rowHref;

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

  // Group-by: ?group=<option key> (local state when the URL is not used).
  const [localGroup, setLocalGroup] = useState("");
  const groupParam = urlState ? (searchParams.get("group") ?? "") : localGroup;
  const activeGroup = groupBy?.options.find((o) => o.key === (groupBy?.fixed ?? groupParam)) ?? null;
  const groupPicker = Boolean(groupBy) && !groupBy?.fixed;
  function setGroupKey(key: string) {
    if (!urlState) {
      setLocalGroup(key);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (key) params.set("group", key);
    else params.delete("group");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  // Column visibility, remembered per browser. Storage can throw (private
  // windows, blocked site data), so every access is guarded and the default is
  // "all columns".
  const storageKey = tableId ? `molly.table.${tableId}.hidden` : null;
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      setHidden(parseHiddenColumns(localStorage.getItem(storageKey), columns.slice(1).map((c) => c.key)));
    } catch {
      /* default: all visible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = toggleHidden(prev, key);
      try {
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* not persisted */
      }
      return next;
    });
  }
  const cols = useMemo(() => columns.filter((c, i) => i === 0 || !hidden.includes(c.key)), [columns, hidden]);
  const hideableCols = useMemo(() => columns.filter((c, i) => i > 0 && c.hideable !== false), [columns]);

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
      const L = live.current;
      // New look, list beside a pane: `o` opens the full page.
      if (e.key !== "j" && e.key !== "k" && e.key !== "Enter" && !(e.key === "o" && L.listMode)) return;
      const wrap = wrapRef.current;
      if (!wrap || wrap.offsetParent === null) return;
      const active = document.activeElement;
      const inside = Boolean(active && wrap.contains(active));
      const onBody = !active || active === document.body;
      // With the pane open, focus may be in the pane: j and k still step through the list.
      const inPane = L.listMode && L.openKey != null && Boolean(active?.closest?.("[data-split-pane]"));
      if (!inside && !inPane && !(onBody && document.querySelector("[data-datatable]") === wrap)) return;
      if (!inside && isTypingTarget(active)) return;
      if (inside && isTypingTarget(active)) return;

      const rowEls = Array.from(wrap.querySelectorAll<HTMLElement>("tbody tr[data-row]")).filter(
        (el) => el.offsetParent !== null
      );
      if (rowEls.length === 0) return;
      const current = active ? rowEls.findIndex((r) => r === active || r.contains(active)) : -1;

      if (L.listMode && L.onOpenRow) {
        // The rows as shown, in order; same order as the elements when none is hidden.
        const shown = L.rows;
        const keys = shown.map((r) => L.rowKey(r));
        if (e.key === "Enter") {
          if (current === -1 || active !== rowEls[current] || !shown[current]) return;
          e.preventDefault();
          L.onOpenRow(shown[current]);
          return;
        }
        if (e.key === "o") {
          const target = shown[L.openKey != null ? keys.indexOf(L.openKey) : current];
          const href = target ? L.rowHref?.(target) : undefined;
          if (!href) return;
          e.preventDefault();
          L.router.push(href);
          return;
        }
        if (L.openKey != null) {
          // Pane open: j and k change the open record, and the cursor goes with it.
          const to = stepCursor(keys, L.openKey, e.key === "j" ? 1 : -1);
          if (to == null) return;
          e.preventDefault();
          const idx = keys.indexOf(to);
          if (to !== L.openKey) L.onOpenRow(shown[idx]);
          const el = rowEls.length === shown.length ? rowEls[idx] : undefined;
          if (inPane) el?.scrollIntoView({ block: "nearest" });
          else el?.focus();
          return;
        }
      }

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

  const keepGroupOrder = Boolean(groupBy?.fixed);
  const groups = useMemo(
    () => (activeGroup ? groupRows(visible, activeGroup.getGroup, keepGroupOrder) : null),
    [visible, activeGroup, keepGroupOrder]
  );

  // New look, table that scrolls sideways inside its own box (not a list beside a pane): say so when
  // more is off to the right, so a column is never just cut off. Nothing happens under the old look.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const watchScroll = v2 && !listMode;
  const tableShown = !loading && !error && visible.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!watchScroll || !tableShown || !el) {
      setMoreRight(false);
      return;
    }
    const update = () => setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    const t = el.querySelector("table");
    if (t) ro?.observe(t);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [watchScroll, tableShown, visible.length]);

  // The rows on screen in order (a collapsed group's rows are not): what j / k / Enter walk.
  const shownRows = useMemo(
    () => (groups ? groups.flatMap((g) => (collapsedGroups.includes(g.id) ? [] : g.rows)) : visible),
    [groups, visible, collapsedGroups]
  );
  live.current.rows = shownRows;
  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Closing the pane hands the cursor back to the row that was open (when focus fell to the page).
  const prevOpenKey = useRef<string | null>(openKey);
  useEffect(() => {
    const prev = prevOpenKey.current;
    prevOpenKey.current = openKey;
    if (!listMode || prev == null || openKey != null) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const rowEls = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>("tbody tr[data-row]") ?? []);
    rowEls.find((el) => el.dataset.key === prev)?.focus();
  }, [openKey, listMode]);

  // Rows shown in the order they appear (grouped order when grouped), for the export.
  const orderedForExport = useMemo(() => (groups ? groups.flatMap((g) => g.rows) : visible), [groups, visible]);
  function exportRows() {
    const exportable = cols.filter((c) => c.exportValue || c.sortValue);
    const csv = toCsv(
      exportable.map((c) => c.header),
      orderedForExport.map((row) => exportable.map((c) => (c.exportValue ? c.exportValue(row) : (c.sortValue!(row) as CsvCell))))
    );
    downloadCsv(csvFilename(exportCsv?.filename ?? label), csv);
  }

  // Only report real changes, so a parent that re-creates `columns` every render
  // cannot loop (visible gets a new identity each time, with identical contents).
  const lastReported = useRef<T[] | null>(null);
  useEffect(() => {
    const prev = lastReported.current;
    if (prev && prev.length === visible.length && prev.every((r, i) => r === visible[i])) return;
    lastReported.current = visible;
    onVisibleRowsChange?.(visible);
  }, [visible, onVisibleRowsChange]);

  // New look (audit #14): a short list has nothing to find, so the search box and chips stay away.
  // The other controls (extras, export, columns) are unaffected. Never applied to a filtered view
  // that already has a search or chip set, and never under the old look.
  const tooShort = v2 && rows.length < minRowsForFilter && state.q.trim() === "" && state.filter === "all";
  const showSearch = !tooShort;
  const showChips = !tooShort;
  const hasToolbar = Boolean(
    (searchText && showSearch) ||
      (chips && chips.length > 0 && showChips) ||
      toolbarExtra ||
      groupPicker ||
      exportCsv ||
      (tableId && hideableCols.length > 0)
  );
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
  const badgeCols = cols.filter((c) => c.mobile === "badge");
  const metaCols = cols.filter((c) => c.mobile === "meta");

  function openRow(e: React.MouseEvent, href: string) {
    if (e.defaultPrevented || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label,summary,[role=button]")) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  // New look, list beside a pane: a plain click on a row or its link opens the record in the
  // pane. Modified clicks (new tab) and clicks on the row's own buttons are left alone.
  function paneClick(e: React.MouseEvent, row: T) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((e.target as HTMLElement).closest("button,input,select,textarea,label,summary,[role=button]")) return;
    e.preventDefault();
    onOpenRow?.(row);
  }
  const isOpenRow = (row: T) => openKey != null && rowKey(row) === openKey;

  function renderRow(row: T) {
        const href = rowHref?.(row);
        return (
          <tr
            key={rowKey(row)}
            data-row=""
            tabIndex={-1}
            {...(listMode
              ? {
                  role: "option",
                  "aria-selected": isOpenRow(row),
                  "data-key": rowKey(row),
                  "data-open": isOpenRow(row) ? "true" : undefined,
                }
              : {})}
            onClick={listMode ? (e) => paneClick(e, row) : href ? (e) => openRow(e, href) : undefined}
            className={cn(
              "group h-11 border-b border-row-divider outline-none transition-colors last:border-0 hover:bg-row-hover focus-within:bg-row-hover focus-visible:bg-row-hover focus-visible:shadow-[inset_2px_0_0_var(--color-accent)]",
              href && "cursor-pointer",
              rowClassName?.(row)
            )}
          >
            {cols.map((c, i) => {
              const content = c.cell(row);
              const plain = typeof content === "string" || typeof content === "number";
              return (
              <td
                key={c.key}
                role={listMode ? "presentation" : undefined}
                data-drop={v2 && i > 0 ? c.dropBelow : undefined}
                // New look: one line per cell, so the full text is the tooltip where it is cut.
                title={v2 ? (c.title?.(row) ?? (plain ? String(content) : undefined)) : undefined}
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
                    onClick={listMode ? (e) => paneClick(e, row) : undefined}
                    className={
                      v2
                        ? // A block flex row that may shrink, so the text inside can truncate.
                          "flex min-w-0 items-center hover:underline focus-visible:underline focus-visible:outline-none"
                        : "inline-flex items-center hover:underline focus-visible:underline focus-visible:outline-none"
                    }
                  >
                    {v2 && plain ? <span className="min-w-0 truncate">{content}</span> : content}
                  </Link>
                ) : (
                  content
                )}
              </td>
              );
            })}
            {rowActions && (
              <td
                role={listMode ? "presentation" : undefined}
                {...(v2 ? { "data-actions": "" } : {})}
                className="px-3 py-1 text-right"
              >
                <div
                  className={
                    v2 && actionsAlwaysVisible
                      ? "flex items-center justify-end gap-1"
                      : "flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                  }
                >
                  {rowActions(row)}
                </div>
              </td>
            )}
          </tr>
        );

  }

  function renderMobileRow(row: T) {
    const href = rowHref?.(row);
    // A cell may hold its own link (the Fund in the deal ledger), and a link inside a link is invalid
    // (a hydration error). So in both looks the row's link wraps the title only and is stretched over
    // the whole row (its ::after), with the cells' own links lifted above it: the same things are
    // clickable and the card looks the same.
    if (href) {
      const lift = "[&_a]:relative [&_a]:z-[1]";
      return (
        <li
          key={rowKey(row)}
          {...(listMode
            ? {
                role: "option",
                "aria-selected": isOpenRow(row),
                "data-key": rowKey(row),
                "data-open": isOpenRow(row) ? "true" : undefined,
                onClick: (e: React.MouseEvent) => paneClick(e, row),
              }
            : {})}
          className={cn("relative px-4 py-3 text-sm", rowClassName?.(row))}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 font-medium">
              <Link
                href={href}
                onClick={listMode ? (e) => paneClick(e, row) : undefined}
                className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {titleCol.cell(row)}
              </Link>
            </span>
            {badgeCols.length > 0 && (
              <span className={cn("num shrink-0 text-[13px]", lift)}>
                {badgeCols.map((c) => <Fragment key={c.key}>{c.cell(row)}</Fragment>)}
              </span>
            )}
          </div>
          {metaCols.length > 0 && (
            <div className={cn("mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground", lift)}>
              {metaCols.map((c) => (
                <span key={c.key}>{c.cell(row)}</span>
              ))}
            </div>
          )}
          {rowActions && <div className="relative z-[1] mt-2 flex items-center gap-1">{rowActions(row)}</div>}
        </li>
      );
    }
    const body = (
      <>
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 font-medium">{titleCol.cell(row)}</span>
          {badgeCols.length > 0 && (
            <span className="num shrink-0 text-[13px]">{badgeCols.map((c) => <Fragment key={c.key}>{c.cell(row)}</Fragment>)}</span>
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
      <li
        key={rowKey(row)}
        {...(listMode
          ? {
              role: "option",
              "aria-selected": isOpenRow(row),
              "data-key": rowKey(row),
              "data-open": isOpenRow(row) ? "true" : undefined,
              onClick: (e: React.MouseEvent) => paneClick(e, row),
            }
          : {})}
        className={cn("relative px-4 py-3 text-sm", rowClassName?.(row))}
      >
        {href ? (
          <Link
            href={href}
            onClick={listMode ? (e) => paneClick(e, row) : undefined}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        ) : (
          body
        )}
        {rowActions && <div className="mt-2 flex items-center gap-1">{rowActions(row)}</div>}
      </li>
    );

  }

  const columnsMenu =
    tableId && hideableCols.length > 0 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            <Columns3 aria-hidden="true" className="h-3.5 w-3.5" />
            Columns
            {hidden.length > 0 && <span className="num font-mono text-[11px] text-muted-foreground">{cols.length}/{columns.length}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Show columns</DropdownMenuLabel>
          {hideableCols.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.key}
              checked={!hidden.includes(c.key)}
              onCheckedChange={() => toggleColumn(c.key)}
            >
              {c.header}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;
  const exportButton = exportCsv ? (
    <Button variant="secondary" size="sm" onClick={exportRows} disabled={visible.length === 0}>
      <Download aria-hidden="true" className="h-3.5 w-3.5" />
      Export CSV
    </Button>
  ) : null;

  // New look: the search box, the chips and the extras sit in one filter bar (ui/filter-bar.tsx).
  // The chips stay single-choice: picking one sets it (tinted, with an x), the x puts it back to "all".
  const v2Toolbar = (
    <FilterBar
      label={`Filter ${label.toLowerCase()}`}
      className={cn(listMode && "sticky top-[var(--bar-h)] z-[5] bg-background")}
      chips={(showChips ? (chips ?? []) : []).map((c) => ({
        key: c.key,
        label: c.label,
        set: state.filter === c.key,
        count: counts[c.key] ?? 0,
        plain: c.key === "all",
      }))}
      onOpen={(key) => writeState({ ...state, filter: key })}
      onRemove={() => writeState({ ...state, filter: "all" })}
      onClearAll={clearFilters}
      showClear={filtersActive}
      leading={
        searchText && showSearch ? (
          <div className="relative w-56 min-w-[140px] flex-none max-md:w-44">
            <label htmlFor={`dt-search-${label}`} className="sr-only">
              {searchPlaceholder ?? `Filter ${label.toLowerCase()}`}
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
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
              className="h-9 w-full rounded-ctl border border-[var(--color-ctl)] bg-transparent pl-9 pr-8 text-row text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:text-base"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-sm border border-border px-1.5 font-mono text-[10px] text-muted-foreground sm:block"
            >
              /
            </kbd>
          </div>
        ) : undefined
      }
      trailing={
        toolbarExtra || groupPicker || columnsMenu || exportButton ? (
          <>
            {/* A filter select is sized to its content, capped at 15rem, so a long company name can't stretch it. */}
            {toolbarExtra && <div className="flex items-center gap-2 [&_select]:max-w-[15rem]">{toolbarExtra}</div>}
            {groupBy && groupPicker && (
              <>
                <label htmlFor={`dt-group-${label}`} className="sr-only">
                  Group {label.toLowerCase()} by
                </label>
                <select
                  id={`dt-group-${label}`}
                  value={activeGroup?.key ?? ""}
                  onChange={(e) => setGroupKey(e.target.value)}
                  className="input-field h-9 w-auto bg-transparent py-0"
                >
                  <option value="">No grouping</option>
                  {groupBy.options.map((o) => (
                    <option key={o.key} value={o.key}>
                      Group by {o.label.toLowerCase()}
                    </option>
                  ))}
                </select>
              </>
            )}
            {columnsMenu}
            {exportButton}
          </>
        ) : undefined
      }
    />
  );

  return (
    <div
      ref={wrapRef}
      data-datatable=""
      {...(v2
        ? {
            "data-density": density,
            "data-list-mode": listMode ? "" : undefined,
            // Hover-revealed row actions take no column of their own (they overlay the row's end).
            "data-hover-actions": rowActions && !actionsAlwaysVisible ? "" : undefined,
            // With the pane open the list is narrower, so its low-priority columns drop earlier.
            "data-pane-open": listMode && openKey != null ? "" : undefined,
            // No filter bar above the list, so its sticky group headings sit right under the header.
            "data-no-toolbar": hasToolbar ? undefined : "",
          }
        : {})}
      className={className}
    >
      {hasToolbar && (v2 ? v2Toolbar : (
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
                className="h-8 w-full rounded-ctl border border-input bg-card pl-8 pr-8 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                      "inline-flex h-8 items-center gap-1.5 rounded-chip border px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          {groupBy && groupPicker && (
            <>
              <label htmlFor={`dt-group-${label}`} className="sr-only">
                Group {label.toLowerCase()} by
              </label>
              <select
                id={`dt-group-${label}`}
                value={activeGroup?.key ?? ""}
                onChange={(e) => setGroupKey(e.target.value)}
                className="h-8 w-auto rounded-ctl border border-input bg-card py-0 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">No grouping</option>
                {groupBy.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    Group by {o.label.toLowerCase()}
                  </option>
                ))}
              </select>
            </>
          )}
          {(exportCsv || (tableId && hideableCols.length > 0)) && (
            <div className="ml-auto flex items-center gap-1.5">
              {columnsMenu}
              {exportButton}
            </div>
          )}
        </div>
      ))}

      {visible.length === 0 && v2 ? (
        // New look, pattern 12: two plain lines, left to the gutter, and the one action.
        <div className="px-[var(--row-pad)] py-6">
          <p className="text-row font-medium text-foreground">No {pluralNoun ?? `${noun}s`} match these filters.</p>
          <p className="mt-1 text-meta text-muted-foreground">Clear filters to see everything.</p>
          {filtersActive && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : visible.length === 0 ? (
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
          <div
            ref={scrollRef}
            data-scroll-more={watchScroll && moreRight ? "true" : undefined}
            className="table-scroll-fade hidden overflow-x-auto border border-border bg-card md:block"
          >
            <table
              className="w-full text-[13px]"
              style={{ ...(minWidth ? { minWidth } : {}), ...(v2 && columnWidths ? { tableLayout: "fixed" } : {}) }}
            >
              <caption className="sr-only">{label}</caption>
              {v2 && columnWidths && (
                <colgroup>
                  {columnWidths.map((w, i) => (
                    <col key={i} style={w == null ? undefined : { width: typeof w === "number" ? `${w}px` : w }} />
                  ))}
                </colgroup>
              )}
              <thead className={v2 && hideHeader ? "sr-only" : undefined}>
                <tr className="border-b border-border text-left">
                  {cols.map((c, i) => {
                    const sortable = Boolean(c.sortValue);
                    const active = state.sort === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={sortable ? ariaSort(active, state.dir) : undefined}
                        data-drop={v2 && i > 0 ? c.dropBelow : undefined}
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
                    <th scope="col" {...(v2 ? { "data-actions": "" } : {})} className="w-px px-3">
                      <span className="sr-only">{actionsLabel}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody {...(listMode ? { role: "listbox", "aria-label": label } : {})}>
                {(groups ?? [{ id: "", label: "", rows: visible }]).map((g) => {
                  // New look: a group heading collapses on click.
                  const collapsed = v2 && collapsedGroups.includes(g.id);
                  const countText = `${g.rows.length} ${g.rows.length === 1 ? noun : (pluralNoun ?? `${noun}s`)}`;
                  return (
                  <Fragment key={g.id || "all"}>
                    {groups && (
                      <tr data-group="" role={listMode ? "presentation" : undefined} className="border-b border-border bg-well">
                        <th
                          scope="rowgroup"
                          role={listMode ? "presentation" : undefined}
                          colSpan={cols.length + (rowActions ? 1 : 0)}
                          className={cn("h-8 px-3 text-left font-semibold text-foreground", cols[0].sticky && "sticky left-0")}
                        >
                          {v2 ? (
                            <button
                              type="button"
                              aria-expanded={!collapsed}
                              onClick={() => toggleGroup(g.id)}
                              className="inline-flex items-center gap-1 rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ChevronRight
                                aria-hidden="true"
                                className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !collapsed && "rotate-90")}
                              />
                              {g.label}
                              <span className="num ml-1 font-normal text-muted-foreground">{countText}</span>
                            </button>
                          ) : (
                            <>
                              {g.label}
                              <span className="num ml-2 font-mono text-[11px] font-normal text-muted-foreground">{countText}</span>
                            </>
                          )}
                        </th>
                      </tr>
                    )}
                    {!collapsed && g.rows.map((row) => renderRow(row))}
                    {groups && !collapsed && groupBy?.subtotal && (
                      <tr data-subtotal="" className="h-10 border-b border-border bg-well/60 font-medium">
                        {(() => {
                          const cells = groupBy.subtotal!(g.rows);
                          return cols.map((c, i) => (
                            <td key={c.key} className={cn("px-3 py-1", c.align === "num" ? "num whitespace-nowrap text-right" : "", c.sticky && i === 0 && "sticky left-0 z-[1] bg-well")}>
                              {i === 0 ? (cells[c.key] ?? groupBy.subtotalLabel ?? "Subtotal") : (cells[c.key] ?? null)}
                            </td>
                          ));
                        })()}
                        {rowActions && <td />}
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list: title + badge, then the key facts. */}
          <ul
            aria-label={label}
            {...(listMode ? { role: "listbox" } : {})}
            className="divide-y divide-row-divider border border-border bg-card md:hidden"
          >
            {(groups ?? [{ id: "", label: "", rows: visible }]).map((g) => {
              const collapsed = v2 && collapsedGroups.includes(g.id);
              return (
                <Fragment key={g.id || "all"}>
                  {groups && (
                    <li
                      {...(v2 ? { "data-group": "", role: listMode ? "presentation" : undefined } : {})}
                      className="flex items-baseline justify-between bg-well px-4 py-2 text-sm font-semibold text-foreground"
                    >
                      {v2 ? (
                        <button
                          type="button"
                          aria-expanded={!collapsed}
                          onClick={() => toggleGroup(g.id)}
                          className="inline-flex items-center gap-1 rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronRight
                            aria-hidden="true"
                            className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !collapsed && "rotate-90")}
                          />
                          {g.label}
                          {/* New look: the count sits beside the label, "2 items", as on desktop. */}
                          <span className="num ml-1 font-normal text-muted-foreground">
                            {g.rows.length} {g.rows.length === 1 ? noun : (pluralNoun ?? `${noun}s`)}
                          </span>
                        </button>
                      ) : (
                        g.label
                      )}
                      {!v2 && <span className="num font-mono text-[11px] font-normal text-muted-foreground">{g.rows.length}</span>}
                    </li>
                  )}
                  {!collapsed && g.rows.map((row) => renderMobileRow(row))}
                </Fragment>
              );
            })}
          </ul>
        </>
      )}

      <p
        aria-live="polite"
        className={cn(
          "mt-2 font-mono text-[11px] text-muted-foreground",
          v2 && "mt-0 px-[var(--row-pad)] py-4 font-sans text-meta"
        )}
      >
        {resultSummary(visible.length, rows.length, noun, pluralNoun)}
      </p>
    </div>
  );
}
