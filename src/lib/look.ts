// New look switch (PLAN-1, WS156). The choice is saved in this browser only
// (localStorage), so there is no schema change and it never follows a person
// to another device. Pure and safe to import anywhere: every storage and
// document access is guarded, and any failure falls back to the old look.

export type Look = "v1" | "v2";
export type Theme = "light" | "dark";

export const LOOK_KEY = "molly.look";
export const THEME_KEY = "molly.theme";
export const LOOK_CHANGE_EVENT = "molly:look-change";

export interface LookState {
  look: Look;
  theme: Theme;
}

export const DEFAULT_LOOK: LookState = { look: "v1", theme: "light" };

/**
 * Runs from layout.tsx before first paint. With the switch off it does nothing
 * at all (no attribute is set), so the page renders exactly as it always has.
 * Keep it in step with applyLook() below.
 */
export const PRE_PAINT_SCRIPT = `try{var l=localStorage.getItem("${LOOK_KEY}");var t=localStorage.getItem("${THEME_KEY}");if(l==="v2"){var d=document.documentElement;d.dataset.look="v2";d.dataset.theme=t==="dark"?"dark":"light";}}catch(e){}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads the saved choice. Anything missing, unreadable or unexpected means the old look. */
export function readLook(): LookState {
  const s = storage();
  if (!s) return DEFAULT_LOOK;
  try {
    const look: Look = s.getItem(LOOK_KEY) === "v2" ? "v2" : "v1";
    const theme: Theme = s.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    return { look, theme };
  } catch {
    return DEFAULT_LOOK;
  }
}

/** Mirrors a state onto <html>. The old look has no attributes at all. */
export function applyLook(state: LookState, root?: HTMLElement | null): void {
  const el = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!el) return;
  if (state.look === "v2") {
    el.dataset.look = "v2";
    el.dataset.theme = state.theme;
  } else {
    delete el.dataset.look;
    delete el.dataset.theme;
  }
}

function notify() {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(LOOK_CHANGE_EVENT));
  } catch {
    /* nothing to tell */
  }
}

function save(key: string, value: string | null) {
  const s = storage();
  if (!s) return;
  try {
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* private mode or full: the choice still applies until reload */
  }
}

export function setLook(look: Look): LookState {
  save(LOOK_KEY, look === "v2" ? "v2" : null);
  const next: LookState = { look, theme: readLook().theme };
  applyLook(next);
  notify();
  return next;
}

export function setTheme(theme: Theme): LookState {
  save(THEME_KEY, theme);
  // If storage is unavailable, trust what is already on <html>.
  const live = typeof document !== "undefined" && document.documentElement.dataset.look === "v2";
  const next: LookState = { look: live ? "v2" : readLook().look, theme };
  applyLook(next);
  notify();
  return next;
}
