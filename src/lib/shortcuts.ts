// Keyboard shortcut logic for the admin app (spec 6.9). Pure: the React side
// (components/layout/shortcuts.tsx) only wires DOM events to these functions.
//
//   Ctrl/Cmd+K  command palette
//   g then <letter>  go to a page (letters come from lib/admin-nav.ts)
//   ?  shortcut cheat sheet
//   /  focus the table filter (DataTable)
//   j / k / Enter  move through and open table rows (DataTable)
//   m / e / Alt+arrows  Team Board card menu, edit, move (BoardCard)
//   PLAN-1, WS164: f  palette on "Filter: "; Esc  one layer at a time
//   (palette → menu → drawer → full page back to the list → pane → filters)
//
// Shortcuts never fire while typing in a field or when a modifier is held.

import { gotoTargets } from "./admin-nav";
import { buildOpenQuery } from "./split-view";

/** How long after `g` the next key still counts as the second half. */
export const GOTO_WINDOW_MS = 1500;

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/**
 * The palette shortcut as it should read on this machine: ⌘K on Apple devices, Ctrl K
 * elsewhere. Both keys open it everywhere; this is only the label. `platform` is
 * navigator.userAgentData?.platform or navigator.platform; an empty string (the server)
 * gets the Ctrl label.
 */
export function paletteKeyLabel(platform: string | null | undefined): string {
  return /mac|iphone|ipad|ipod/i.test(platform ?? "") ? "⌘K" : "Ctrl K";
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
  | { type: "help" }
  | { type: "filter" };

/** What `f` prefills in the palette (PLAN-1, WS164). */
export const FILTER_PREFIX = "Filter: ";

// Layered Esc (PLAN-1, WS164, pattern 5): one press closes one layer, top first. The palette,
// menus and dialogs/sheets are Radix layers that close themselves (and mark the event handled);
// the rest are ours, and each handler asks isTopEscLayer before acting, so the order never
// depends on which listener happened to register first.
export const ESC_ORDER = ["palette", "menu", "drawer", "full-page", "pane", "filters"] as const;
export type EscLayer = (typeof ESC_ORDER)[number];
export type OpenEscLayers = Partial<Record<EscLayer, boolean>>;

/** The layer one Esc should close now, or null when nothing is open. */
export function topEscLayer(open: OpenEscLayers): EscLayer | null {
  return ESC_ORDER.find((l) => open[l]) ?? null;
}

/** True when no layer above `layer` is open (so `layer` may handle this Esc). */
export function isTopEscLayer(layer: EscLayer, open: OpenEscLayers): boolean {
  return topEscLayer({ ...open, [layer]: true }) === layer;
}

interface QueryableLike {
  querySelector(selector: string): unknown;
}

/**
 * The layers the page shows right now, read from the DOM: the palette (cmdk), an open menu, a
 * drawer (the phone sidebar, or any dialog or sheet other than the palette) and the side pane.
 * The full page and the filters are known only to their owners, which pass them in.
 */
export function readEscLayers(doc: QueryableLike | null | undefined): OpenEscLayers {
  if (!doc) return {};
  return {
    // Radix keeps a closing layer in the DOM while it animates out (data-state="closed"), so
    // only open ones count; otherwise a quick second Esc would be swallowed.
    palette: Boolean(doc.querySelector('[data-palette][data-state="open"]')),
    menu: Boolean(doc.querySelector('[role="menu"][data-state="open"]')),
    drawer: Boolean(
      doc.querySelector(
        '[data-drawer-open],[role="dialog"][data-state="open"]:not([data-palette]),[role="alertdialog"][data-state="open"]'
      )
    ),
    pane: Boolean(doc.querySelector("[data-split-pane]")),
  };
}

/** sessionStorage key: where the pane's "Open full page" came from (so Esc can go back). */
export const EXPAND_RETURN_KEY = "molly:expand-return";

export interface ExpandReturn {
  /** The list URL with ?open=<id>, as it was when the full page was opened. */
  from: string;
  /** The full page's href. */
  to: string;
}

/**
 * Esc on a full page that was opened from a pane goes back to the list with that pane open.
 * Returns the list URL when `pathname` is the page the entry points at, else null (the page was
 * reached some other way, so Esc does nothing there).
 */
export function expandReturnHref(entry: ExpandReturn | null | undefined, pathname: string): string | null {
  if (!entry || typeof entry.from !== "string" || typeof entry.to !== "string") return null;
  // Only same-site paths: never send anyone off the app.
  if (!entry.from.startsWith("/") || entry.from.startsWith("//")) return null;
  const toPath = entry.to.split(/[?#]/)[0];
  return toPath === pathname ? entry.from : null;
}

/**
 * Called when a pane's record is opened as a full page (the pane's expand button, or `o`):
 * remembers the list URL with that record open, so Esc on the full page comes back to it.
 * `openId` is the record (default: whatever ?open= the URL has now). Browser only; quiet if
 * storage is blocked.
 */
export function rememberExpandReturn(to: string, openId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const { pathname, search } = window.location;
    const from = openId ? `${pathname}${buildOpenQuery(new URLSearchParams(search), openId)}` : `${pathname}${search}`;
    window.sessionStorage.setItem(EXPAND_RETURN_KEY, JSON.stringify({ from, to } satisfies ExpandReturn));
  } catch {
    // Storage blocked: Esc on the full page just does nothing.
  }
}

export function parseExpandReturn(raw: string | null | undefined): ExpandReturn | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && typeof (v as ExpandReturn).from === "string" && typeof (v as ExpandReturn).to === "string") {
      return { from: (v as ExpandReturn).from, to: (v as ExpandReturn).to };
    }
  } catch {
    // Not ours, or damaged: ignore it.
  }
  return null;
}

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
  // `f` opens the palette on "Filter: ".
  if (key === "f") return { state: { armedAt: null }, result: { type: "filter" } };
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
  // PLAN-1, WS164.
  { keys: ["Esc"], label: "Close one layer: palette, menu, panel, full page, pane, then filters" },
  { keys: ["f"], label: "Filter the list on this page from the palette" },
  { keys: ["a"], label: "Approvals pane: approve the signup" },
  { keys: ["r"], label: "Needs you pane: send a reminder" },
  { keys: ["d"], label: "Needs you pane: dismiss the alert" },
  { keys: ["u"], label: "Team Board card: mark as unblocked" },
];

/** The cheat sheet's rows (one look since WS168, so every row). */
export function shortcutHelpRows(): { keys: string[]; label: string }[] {
  return SHORTCUT_HELP;
}
