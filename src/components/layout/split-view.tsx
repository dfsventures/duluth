"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useNewLook } from "@/lib/use-new-look";
import { buildOpenQuery, parseOpenParam } from "@/lib/split-view";
import { isTypingTarget } from "@/lib/shortcuts";
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
 * List and detail pane (PLAN-1, WS160, pattern 1). Under the old look it is just the list.
 * Under the new look the pane is min(58%, 620px) wide on the `pane` surface and slides in over
 * 160ms; the list stays beside it (on a phone the pane covers it, with a Back button). Esc closes
 * the pane first, so it is one layer at a time: a dialog or menu that is open handles its own Esc,
 * and a text field keeps it. Opening from the keyboard or a click moves focus into the pane, so
 * its buttons are a Tab away; reopening from a reload does not take focus.
 */
export function SplitView({ list, pane, open, onClose, paneLabel }: SplitViewProps) {
  const newLook = useNewLook();
  const showPane = newLook && open != null && pane != null;
  const asideRef = useRef<HTMLElement>(null);
  const wasShown = useRef(false);

  useEffect(() => {
    if (!showPane) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target as HTMLElement | null)) return;
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

  if (!newLook) return <>{list}</>;

  return (
    <div className={cn("relative", showPane && "min-h-[calc(100dvh-var(--bar-h))]")}>
      <div className={cn("list-pane", showPane && "md:mr-[min(58%,620px)]")}>{list}</div>
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
