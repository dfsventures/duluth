"use client";

// UI overhaul phase 4 (spec 6.9): global admin shortcuts + the "?" cheat sheet.
// Logic lives in lib/shortcuts.ts (pure, tested); this only wires DOM events.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { ALL_ADMIN_PAGES } from "@/lib/admin-nav";
import {
  EXPAND_RETURN_KEY,
  expandReturnHref,
  FILTER_PREFIX,
  isPaletteShortcut,
  isTopEscLayer,
  isTypingTarget,
  parseExpandReturn,
  readEscLayers,
  shortcutHelpRows,
  stepShortcut,
  type GotoState,
} from "@/lib/shortcuts";
import { escapeBelongsToField } from "@/lib/split-view";
import { FILTERABLE_LIST_SELECTOR } from "@/lib/command-palette";
import { openCommandPalette, openCommandPaletteWith } from "./command-palette";

function readExpandReturn() {
  try {
    return parseExpandReturn(window.sessionStorage.getItem(EXPAND_RETURN_KEY));
  } catch {
    return null;
  }
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="min-w-[22px] border border-border bg-background px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function Shortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);
  const state = useRef<GotoState>({ armedAt: null });
  const live = useRef({ pathname });
  live.current = { pathname };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isPaletteShortcut(e)) {
        e.preventDefault();
        openCommandPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const { pathname: path } = live.current;
      // Esc on a full page opened from a pane goes back to the list with that pane open, once
      // nothing above it (palette, menu, drawer) is open. A text field keeps its Esc. Only the
      // pane (and its `o` key) writes the return entry, so this also works on /updates/[id],
      // which sits outside /admin.
      if (e.key === "Escape") {
        if (escapeBelongsToField(document.activeElement)) return;
        if (!isTopEscLayer("full-page", readEscLayers(document))) return;
        const back = expandReturnHref(readExpandReturn(), path);
        if (!back) return;
        e.preventDefault();
        try {
          window.sessionStorage.removeItem(EXPAND_RETURN_KEY);
        } catch {
          // Storage blocked: going back still works.
        }
        router.push(back);
        return;
      }
      if (isTypingTarget(document.activeElement)) return;
      const step = stepShortcut(state.current, e.key, Date.now());
      state.current = step.state;
      if (step.result.type === "goto") {
        e.preventDefault();
        router.push(step.result.href);
      } else if (step.result.type === "help") {
        e.preventDefault();
        setHelpOpen(true);
      } else if (step.result.type === "filter") {
        // Only where there is a list to filter.
        if (!document.querySelector(FILTERABLE_LIST_SELECTOR)) return;
        e.preventDefault();
        openCommandPaletteWith(FILTER_PREFIX);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  // The return entry only lasts while you stay on that full page: going anywhere else drops it,
  // so a later visit to the same page by another route does not "go back" to an old list.
  useEffect(() => {
    const entry = readExpandReturn();
    if (entry && !expandReturnHref(entry, pathname)) {
      try {
        window.sessionStorage.removeItem(EXPAND_RETURN_KEY);
      } catch {
        // Storage blocked: nothing stored either.
      }
    }
  }, [pathname]);

  const gotoRows = ALL_ADMIN_PAGES.filter((p) => p.goto);
  const helpRows = shortcutHelpRows();

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent title="Keyboard shortcuts" description="Shortcuts pause while you are typing in a field." size="md">
        <DialogBody className="space-y-5">
          <section aria-label="General">
            <ul className="space-y-2 text-sm">
              {helpRows.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-4">
                  <span>{row.label}</span>
                  <Keys keys={row.keys} />
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="goto-heading">
            <h3 id="goto-heading" className="mb-2 font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">
              Go to (press g, then)
            </h3>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {gotoRows.map((p) => (
                <li key={p.href} className="flex items-center justify-between gap-3">
                  <span>{p.labelV2 ?? p.label}</span>
                  <Keys keys={["g", p.goto!]} />
                </li>
              ))}
            </ul>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
