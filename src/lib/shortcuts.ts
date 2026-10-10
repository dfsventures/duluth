// Keyboard shortcut logic for the admin app (spec 6.9). Pure: the React side
// (components/layout/shortcuts.tsx) only wires DOM events to these functions.
//
//   Ctrl/Cmd+K  command palette
//   g then <letter>  go to a page (letters come from lib/admin-nav.ts)
//   ?  shortcut cheat sheet
//   /  focus the table filter (DataTable)
//   j / k / Enter  move through and open table rows (DataTable)
//   m / e / Alt+arrows  Team Board card menu, edit, move (BoardCard)
//
// Shortcuts never fire while typing in a field or when a modifier is held.

import { gotoTargets } from "./admin-nav";

/** How long after `g` the next key still counts as the second half. */
export const GOTO_WINDOW_MS = 1500;

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

export function isTypingTarget(el: TargetLike | null | undefined): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Inside an open dialog or the palette, plain letters belong to that surface.
  return Boolean(el.closest?.('[role="dialog"],[role="alertdialog"],[cmdk-root]'));
}

export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

export function isPaletteShortcut(e: KeyLike): boolean {
  return (Boolean(e.metaKey) || Boolean(e.ctrlKey)) && !e.altKey && e.key.toLowerCase() === "k";
}

export interface GotoState {
  /** Timestamp when `g` was pressed, or null when not waiting. */
  armedAt: number | null;
}

export type ShortcutResult =
  | { type: "none" }
  | { type: "armed" }
  | { type: "goto"; href: string }
  | { type: "help" };

/**
 * Feed plain key presses (already filtered for typing targets and modifiers).
 * Returns the new state and what to do.
 */
export function stepShortcut(
  state: GotoState,
  key: string,
  now: number
): { state: GotoState; result: ShortcutResult } {
  const armed = state.armedAt !== null && now - state.armedAt <= GOTO_WINDOW_MS;

  if (armed) {
    const page = gotoTargets()[key.toLowerCase()];
    if (page) return { state: { armedAt: null }, result: { type: "goto", href: page.href } };
    // Any other key cancels; `g` again re-arms.
    if (key.toLowerCase() === "g") return { state: { armedAt: now }, result: { type: "armed" } };
    return { state: { armedAt: null }, result: { type: "none" } };
  }

  if (key === "g") return { state: { armedAt: now }, result: { type: "armed" } };
  if (key === "?") return { state: { armedAt: null }, result: { type: "help" } };
  return { state: { armedAt: null }, result: { type: "none" } };
}

/** Rows for the cheat sheet. */
export const SHORTCUT_HELP: { keys: string[]; label: string }[] = [
  { keys: ["Ctrl/⌘", "K"], label: "Search and jump to anything" },
  { keys: ["?"], label: "Show this list" },
  { keys: ["/"], label: "Filter the table on this page" },
  { keys: ["j"], label: "Next table row" },
  { keys: ["k"], label: "Previous table row" },
  { keys: ["Enter"], label: "Open the focused row" },
  // Team Board: these act on the card that has focus.
  { keys: ["m"], label: "Team Board: open the card's menu" },
  { keys: ["e"], label: "Team Board: edit the card" },
  { keys: ["Alt", "↑", "↓"], label: "Team Board: move the card up or down its column" },
  { keys: ["Alt", "←", "→"], label: "Team Board: move the card to the next column" },
];
