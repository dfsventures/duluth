"use client";

// UI overhaul phase 4 (spec 6.9): global admin shortcuts + the "?" cheat sheet.
// Logic lives in lib/shortcuts.ts (pure, tested); this only wires DOM events.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { ALL_ADMIN_PAGES } from "@/lib/admin-nav";
import {
  isPaletteShortcut,
  isTypingTarget,
  SHORTCUT_HELP,
  stepShortcut,
  type GotoState,
} from "@/lib/shortcuts";
import { openCommandPalette } from "./command-palette";

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
  const [helpOpen, setHelpOpen] = useState(false);
  const state = useRef<GotoState>({ armedAt: null });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isPaletteShortcut(e)) {
        e.preventDefault();
        openCommandPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(document.activeElement)) return;
      const step = stepShortcut(state.current, e.key, Date.now());
      state.current = step.state;
      if (step.result.type === "goto") {
        e.preventDefault();
        router.push(step.result.href);
      } else if (step.result.type === "help") {
        e.preventDefault();
        setHelpOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  const gotoRows = ALL_ADMIN_PAGES.filter((p) => p.goto);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent title="Keyboard shortcuts" description="Shortcuts pause while you are typing in a field." size="md">
        <DialogBody className="space-y-5">
          <section aria-label="General">
            <ul className="space-y-2 text-sm">
              {SHORTCUT_HELP.map((row) => (
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
                  <span>{p.label}</span>
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
