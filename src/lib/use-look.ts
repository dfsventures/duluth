"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LOOK, LOOK_CHANGE_EVENT, LOOK_KEY, THEME_KEY, readLook, setLook, setTheme, type LookState } from "./look";

// useSyncExternalStore needs a stable snapshot object between changes.
let cache: LookState = DEFAULT_LOOK;
function snapshot(): LookState {
  const next = readLook();
  if (next.look !== cache.look || next.theme !== cache.theme) cache = next;
  return cache;
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOOK_KEY || e.key === THEME_KEY || e.key === null) cb();
  };
  window.addEventListener(LOOK_CHANGE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LOOK_CHANGE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved look and theme. The server and first client render see the old look, so hydration matches. */
export function useLook() {
  const state = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_LOOK);
  const toggleLook = useCallback(() => setLook(readLook().look === "v2" ? "v1" : "v2"), []);
  const toggleTheme = useCallback(() => setTheme(readLook().theme === "dark" ? "light" : "dark"), []);
  return { ...state, toggleLook, toggleTheme };
}
