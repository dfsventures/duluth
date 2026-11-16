"use client";

import { useSyncExternalStore } from "react";
import { paletteKeyLabel } from "./shortcuts";

// The platform never changes while the page is open, so there is nothing to subscribe to.
const subscribe = () => () => {};

function clientLabel(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return paletteKeyLabel(nav.userAgentData?.platform || nav.platform);
}

/** "⌘K" on Apple devices, "Ctrl K" elsewhere. The server and first client render say "Ctrl K", so hydration matches. */
export function usePaletteKey(): string {
  return useSyncExternalStore(subscribe, clientLabel, () => paletteKeyLabel(""));
}
