"use client";

import { useCallback, useState } from "react";
import { toast } from "@/lib/toast";

export type FlashMessage = { type: "success" | "error"; text: string };

/**
 * Drop-in for the `useState<{type, text} | null>` banner pattern that ~14 pages
 * used for save/send results. Same `[message, setMessage]` shape, but setting a
 * message also raises a toast (success auto-dismisses, errors stay until
 * dismissed), so the page no longer shoves its layout around. `message` is kept
 * so the few inline readers keep working; setMessage(null) just clears it.
 */
export function useFlashMessage(): [FlashMessage | null, (m: FlashMessage | null) => void] {
  const [message, setState] = useState<FlashMessage | null>(null);
  const setMessage = useCallback((m: FlashMessage | null) => {
    setState(m);
    if (!m) return;
    if (m.type === "success") toast.success(m.text);
    else toast.error(m.text);
  }, []);
  return [message, setMessage];
}
