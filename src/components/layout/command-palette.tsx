"use client";

// UI overhaul phase 4 (spec 6.9): the Ctrl/Cmd+K palette, admin only. cmdk does
// the matching, listbox semantics and arrow-key movement; the name index comes
// from GET /api/admin/search the first time it opens.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import {
  buildPaletteItems,
  FILTER_LIST_EVENT,
  FILTERABLE_LIST_SELECTOR,
  filterListItems,
  GROUP_ORDER,
  newUpdateItems,
  themeActionItems,
  type PaletteItem,
  type SearchIndex,
} from "@/lib/command-palette";
import { buildOpenQuery } from "@/lib/split-view";
import { FILTER_PREFIX } from "@/lib/shortcuts";

import { useTheme } from "@/lib/use-look";
import { usePaletteKey } from "@/lib/use-palette-key";

export const OPEN_PALETTE_EVENT = "molly:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

/** Opens the palette with `text` already in the box (`f` passes "Filter: "). */
export function openCommandPaletteWith(text: string) {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { prefill: text } }));
}

// Module cache so reopening is instant; refreshed after a minute.
let cached: { at: number; index: SearchIndex } | null = null;
const CACHE_MS = 60_000;

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(cached?.index ?? null);
  const [failed, setFailed] = useState(false);
  // Whether the page behind has a list "Filter: …" can act on; read each time the palette opens.
  const [hasList, setHasList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ prefill?: string } | undefined>).detail;
      // Set before the box mounts, so it opens with the text in it ("" for a plain open).
      setQuery(typeof detail?.prefill === "string" ? detail.prefill : "");
      setHasList(Boolean(document.querySelector(FILTERABLE_LIST_SELECTOR)));
      setOpen(true);
    };
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setIndex(cached.index);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/search")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("search failed"))))
      .then((data: SearchIndex) => {
        cached = { at: Date.now(), index: data };
        if (!cancelled) {
          setIndex(data);
          setFailed(false);
        }
      })
      // The page list still works without the index.
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const { theme, toggleTheme } = useTheme();
  const paletteKey = usePaletteKey();

  const items = useMemo(
    () => [
      ...buildPaletteItems(index, pathname),
      ...themeActionItems(theme),
      // "Filter: …" (PLAN-1, WS164).
      ...filterListItems(query, hasList),
      ...newUpdateItems(index, query),
    ],
    [index, query, theme, pathname, hasList]
  );

  const go = useCallback(
    (item: PaletteItem) => {
      // Stays open: puts "Filter: " in the box so the next words filter the list.
      if (item.action === "prefill-filter") return setQuery(FILTER_PREFIX);
      setOpen(false);
      if (item.action === "toggle-theme") return toggleTheme();
      if (item.action === "filter-list") {
        window.dispatchEvent(new CustomEvent(FILTER_LIST_EVENT, { detail: { text: item.filterText ?? "" } }));
        return;
      }
      if (item.action === "open-pane" && item.openId) {
        // Same as clicking the row: ?open=<id> on this page, keeping its search, filter and sort.
        router.replace(`${pathname}${buildOpenQuery(new URLSearchParams(window.location.search), item.openId)}`, { scroll: false });
        return;
      }
      router.push(item.href);
    },
    [router, pathname, toggleTheme]
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 flex items-start justify-center bg-[color:var(--scrim)] px-4 pt-[12vh] v2:pt-24 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out">
          <DialogPrimitive.Content
            data-palette=""
            aria-describedby={undefined}
            // Radix would focus the box with its text selected, so "Filter: " (from `f`) would be
            // replaced by the first key typed. Focus it with the caret at the end instead.
            onOpenAutoFocus={(e) => {
              const el = inputRef.current;
              if (!el) return;
              e.preventDefault();
              el.focus();
              el.setSelectionRange(el.value.length, el.value.length);
            }}
            className="w-full max-w-[520px] border border-border bg-card shadow-float data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out v2:max-w-[560px] v2:rounded-float v2:bg-pane v2:data-[state=open]:[animation-duration:160ms]"
          >
            <DialogPrimitive.Title className="sr-only">Search and jump to anything</DialogPrimitive.Title>
            <Command label="Search and jump to anything" loop>
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  ref={inputRef}
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Jump to a company, fund, page or action"
                  className="h-12 w-full bg-transparent v2:h-[52px] text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <Command.List className="max-h-[320px] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nothing found.
                </Command.Empty>
                {GROUP_ORDER.map((group) => {
                  const inGroup = items.filter((i) => i.group === group);
                  if (inGroup.length === 0) return null;
                  return (
                    <Command.Group
                      key={group}
                      heading={group}
                      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-label [&_[cmdk-group-heading]]:text-muted-foreground v2:[&_[cmdk-group-heading]]:font-sans v2:[&_[cmdk-group-heading]]:text-meta v2:[&_[cmdk-group-heading]]:font-medium v2:[&_[cmdk-group-heading]]:normal-case v2:[&_[cmdk-group-heading]]:tracking-normal"
                    >
                      {inGroup.map((item) => (
                        <Command.Item
                          key={item.id}
                          value={`${item.group} ${item.label} ${item.id}`}
                          keywords={item.keywords}
                          onSelect={() => go(item)}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] text-foreground data-[selected=true]:bg-wash v2:rounded v2:py-2 v2:text-row v2:data-[selected=true]:bg-sel"
                        >
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <span className="shrink-0 font-mono text-label uppercase tracking-label text-muted-foreground v2:font-sans v2:text-meta v2:normal-case v2:tracking-normal">
                            {item.hint}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}
              </Command.List>
              <div className="flex items-center justify-between border-t border-border px-4 py-2 font-mono text-[11px] text-muted-foreground v2:font-sans v2:text-meta">
                <span>{failed ? "Names could not be loaded. Pages still work." : "Enter to open, Esc to close"}</span>
                <span aria-hidden="true">{paletteKey}</span>
              </div>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
