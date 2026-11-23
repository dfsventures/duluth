"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_CHANGE_EVENT, THEME_KEY, readTheme, setTheme, type Theme } from "./look";

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) cb();
  };
  window.addEventListener(THEME_CHANGE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved theme. The server and first client render see light, so hydration matches. */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
  const toggleTheme = useCallback(() => {
    setTheme(readTheme() === "dark" ? "light" : "dark");
  }, []);
  return { theme, toggleTheme };
}
