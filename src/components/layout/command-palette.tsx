"use client";

// UI overhaul phase 4 (spec 6.9): the Ctrl/Cmd+K palette, admin only. cmdk does
// the matching, listbox semantics and arrow-key movement; the name index comes
// from GET /api/admin/search the first time it opens.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import {
  buildPaletteItems,
  GROUP_ORDER,
  newUpdateItems,
  type PaletteItem,
  type SearchIndex,
} from "@/lib/command-palette";

export const OPEN_PALETTE_EVENT = "molly:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

// Module cache so reopening is instant; refreshed after a minute.
let cached: { at: number; index: SearchIndex } | null = null;
const CACHE_MS = 60_000;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(cached?.index ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
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

  const items = useMemo(() => [...buildPaletteItems(index), ...newUpdateItems(index, query)], [index, query]);

  const go = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router]
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 flex items-start justify-center bg-obsidian/35 px-4 pt-[12vh] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="w-full max-w-[520px] border border-border bg-card shadow-float data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out"
          >
            <DialogPrimitive.Title className="sr-only">Search and jump to anything</DialogPrimitive.Title>
            <Command label="Search and jump to anything" loop>
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Jump to a company, fund, page or action"
                  className="h-12 w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
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
                      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-label [&_[cmdk-group-heading]]:text-muted-foreground"
                    >
                      {inGroup.map((item) => (
                        <Command.Item
                          key={item.id}
                          value={`${item.group} ${item.label} ${item.id}`}
                          keywords={item.keywords}
                          onSelect={() => go(item)}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] text-foreground data-[selected=true]:bg-wash"
                        >
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <span className="shrink-0 font-mono text-label uppercase tracking-label text-muted-foreground">
                            {item.hint}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}
              </Command.List>
              <div className="flex items-center justify-between border-t border-border px-4 py-2 font-mono text-[11px] text-muted-foreground">
                <span>{failed ? "Names could not be loaded. Pages still work." : "Enter to open, Esc to close"}</span>
                <span aria-hidden="true">Ctrl K</span>
              </div>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
