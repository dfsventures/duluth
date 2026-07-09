"use client";

import { useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface UseDraftAutosaveOptions {
  /** Autosave only ever runs for an existing draft (Part 8, Q16 = B) — the
   * new-update page passes `enabled: false` until the first manual save. */
  enabled: boolean;
  /** True whenever the in-memory form differs from the last saved state. */
  dirty: boolean;
  /** Suppressed while true — publish/schedule/manual-save are already in flight. */
  suppressed: boolean;
  /** Debounce window after the last change, ms. */
  delayMs?: number;
  onSave: () => Promise<void>;
}

/**
 * Debounced autosave for an existing draft, plus the "Saved · time" /
 * "Saving…" / "Unsaved changes" ambient indicator text (Part 8, WS20.5).
 * No schema/API changes — callers pass their existing save function.
 */
export function useDraftAutosave({ enabled, dirty, suppressed, delayMs = 30_000, onSave }: UseDraftAutosaveOptions) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled || !dirty || suppressed) {
      if (dirty && !suppressed) setSaveState("dirty");
      return;
    }
    setSaveState("dirty");
    timerRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await onSave();
        setSaveState("saved");
        setLastSavedAt(new Date());
      } catch {
        setSaveState("error");
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dirty, suppressed, delayMs]);

  function markSaved(at: Date = new Date()) {
    setSaveState("saved");
    setLastSavedAt(at);
  }

  const label =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved" && lastSavedAt
        ? `Saved · ${lastSavedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : saveState === "dirty"
          ? "Unsaved changes"
          : saveState === "error"
            ? "Couldn't save"
            : "";

  return { saveState, label, markSaved };
}
