"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildOpenQuery, escapeBelongsToField, parseOpenParam } from "@/lib/split-view";
import { isTopEscLayer, readEscLayers } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * The open record, kept in the address as ?open=<id> so a reload (or a link) reopens it. Changing
 * it uses router.replace, so it adds no history entry and does not navigate. Other query params
 * (the table's search, filter and sort) are kept. Needs a <Suspense> above it, as every
 * useSearchParams does.
 */
export function useOpenParam(): [string | null, (id: string | null) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = parseOpenParam(searchParams.get("open"));
  const setOpen = useCallback(
    (id: string | null) => router.replace(`${pathname}${buildOpenQuery(searchParams, id)}`, { scroll: false }),
    [router, pathname, searchParams]
  );
  return [open, setOpen];
}

/**
 * Gives its children the open id and its setter, and holds the <Suspense> boundary that
 * useSearchParams needs while the page is prerendered. Wrapping just the list area (not the
 * whole page) keeps the page's own shell and header in the server HTML exactly as under the old
 * look. `fallback` should be what the list shows while it waits (a skeleton).
 */
export function OpenParam({
  fallback,
  children,
}: {
  fallback?: React.ReactNode;
  children: (open: string | null, setOpen: (id: string | null) => void) => React.ReactNode;
}) {
  return (
    <Suspense fallback={fallback ?? null}>
      <OpenParamInner>{children}</OpenParamInner>
    </Suspense>
  );
}

function OpenParamInner({ children }: { children: (open: string | null, setOpen: (id: string | null) => void) => React.ReactNode }) {
  const [open, setOpen] = useOpenParam();
  return <>{children(open, setOpen)}</>;
}

interface SplitViewProps {
  /** The list (a DataTable with onOpenRow). */
  list: React.ReactNode;
  /** A <DetailPane>. Null when there is no record to show. */
  pane: React.ReactNode;
  /** Id of the open record, from useOpenParam. */
  open: string | null;
  onClose: () => void;
  /** Names the pane for assistive tech (the record's title). */
  paneLabel?: string;
}

/**
 * List and detail pane (PLAN-1, WS160, pattern 1). The pane is min(58%, 620px) wide on the `pane` surface and slides in over
 * 160ms; the list stays beside it (on a phone the pane covers it, with a Back button). Esc closes
 * the pane first, so it is one layer at a time: a dialog or menu that is open handles its own Esc,
 * and a text field keeps it. Opening from the keyboard or a click moves focus into the pane, so
 * its buttons are a Tab away; reopening from a reload does not take focus.
 */
export function SplitView({ list, pane, open, onClose, paneLabel }: SplitViewProps) {
  const showPane = open != null && pane != null;
  const asideRef = useRef<HTMLElement>(null);
  const wasShown = useRef(false);

  useEffect(() => {
    if (!showPane) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (escapeBelongsToField(e.target as HTMLElement | null)) return;
      // The phone drawer (or any other layer above the pane) closes first (PLAN-1, WS164).
      if (!isTopEscLayer("pane", readEscLayers(document))) return;
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPane, onClose]);

  useEffect(() => {
    if (showPane && !wasShown.current) {
      const active = document.activeElement;
      if (active && active !== document.body && active.closest("[data-datatable]")) asideRef.current?.focus();
    }
    wasShown.current = showPane;
  }, [showPane]);

  return (
    <div className={cn("relative", showPane && "min-h-[calc(100dvh-var(--bar-h))]")}>
      {/* The list's right margin and the pane's width and bleed come from globals.css (.list-pane, [data-split-pane]). */}
      <div className="list-pane" data-pane-shown={showPane ? "" : undefined}>
        {list}
      </div>
      {showPane && (
        <aside
          ref={asideRef}
          data-split-pane=""
          tabIndex={-1}
          aria-label={paneLabel}
          className="absolute inset-y-0 right-0 z-[6] w-full focus:outline-none md:w-[min(58%,620px)]"
        >
          <div className="sticky top-[var(--bar-h)] flex h-[calc(100dvh-var(--bar-h))] animate-pane-in flex-col border-l border-border bg-pane max-md:border-l-0">
            {pane}
          </div>
        </aside>
      )}
    </div>
  );
}
