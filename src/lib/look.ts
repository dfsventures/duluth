// Light / dark theme (PLAN-1, WS156; one look since WS168). The choice is saved in this browser only
// (localStorage), so there is no schema change and it never follows a person to another device. Pure
// and safe to import anywhere: every storage and document access is guarded, and any failure falls
// back to light.
//
// <html data-theme> is always set ("light" or "dark") by the pre-paint script, and the app's styles key
// off it: the `v2:` variants and the [data-v2-scope] rules in globals.css start with html[data-theme].
// The old "molly.look" key (the new-look switch, removed in WS168) is ignored.

export type Theme = "light" | "dark";

export const THEME_KEY = "molly.theme";
export const THEME_CHANGE_EVENT = "molly:theme-change";

export const DEFAULT_THEME: Theme = "light";

/**
 * Runs from layout.tsx before first paint, so the saved theme never flashes. Always sets data-theme,
 * light when nothing (or anything unexpected) is saved. Keep it in step with applyTheme() below.
 */
export const PRE_PAINT_SCRIPT = `try{document.documentElement.dataset.theme=localStorage.getItem("${THEME_KEY}")==="dark"?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads the saved theme. Anything missing, unreadable or unexpected means light. */
export function readTheme(): Theme {
  const s = storage();
  if (!s) return DEFAULT_THEME;
  try {
    return s.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return DEFAULT_THEME;
  }
}

/** Mirrors a theme onto <html>. */
export function applyTheme(theme: Theme, root?: HTMLElement | null): void {
  const el = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!el) return;
  el.dataset.theme = theme;
}

function notify() {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  } catch {
    /* nothing to tell */
  }
}

export function setTheme(theme: Theme): Theme {
  const s = storage();
  if (s) {
    try {
      s.setItem(THEME_KEY, theme);
    } catch {
      /* private mode or full: the choice still applies until reload */
    }
  }
  applyTheme(theme);
  notify();
  return theme;
}
