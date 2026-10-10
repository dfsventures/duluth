"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { useCallback, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOAST_VIEWPORT_ATTR } from "@/lib/toast-guard";
import { dismissToast, getServerToasts, getToasts, subscribe, type ToastKind } from "@/lib/toast";

const MARKER: Record<ToastKind, string> = {
  success: "bg-acacia",
  error: "bg-laterite",
  info: "bg-sky",
  undo: "bg-sky",
};

/**
 * Mount once (root layout). Bottom-center; errors are announced assertively and
 * stay until dismissed. Enter/exit motion is in tailwind.config.ts and is zeroed
 * by the global prefers-reduced-motion rule.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getToasts, getServerToasts);
  // Closing toasts stay mounted (open=false) just long enough to play the exit
  // animation, then leave the store.
  const [closing, setClosing] = useState<ReadonlySet<string>>(new Set());
  const close = useCallback((id: string) => {
    setClosing((prev) => new Set(prev).add(id));
    setTimeout(() => {
      dismissToast(id);
      setClosing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 160);
  }, []);

  return (
    <ToastPrimitive.Provider label="Notifications" swipeDirection="down">
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          type={t.kind === "error" ? "foreground" : "background"}
          duration={t.duration}
          open={!closing.has(t.id)}
          onOpenChange={(open) => {
            if (!open) close(t.id);
          }}
          className={cn(
            "flex items-start gap-3 rounded-sm bg-obsidian px-4 py-3 text-[13px] text-paper shadow-float",
            "data-[state=open]:animate-toast-in data-[state=closed]:animate-toast-out",
            "data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)]",
            "data-[swipe=cancel]:translate-y-0 data-[swipe=cancel]:transition-transform",
            "data-[swipe=end]:translate-y-[var(--radix-toast-swipe-end-y)] data-[swipe=end]:animate-toast-out"
          )}
        >
          <span aria-hidden="true" className={cn("mt-[5px] h-[7px] w-[7px] shrink-0", MARKER[t.kind])} />
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="break-words font-medium leading-5">{t.message}</ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="mt-0.5 break-words text-[12px] leading-4 text-paper/80">
                {t.description}
              </ToastPrimitive.Description>
            )}
          </div>
          {t.action && (
            <ToastPrimitive.Action
              altText={`${t.action.label}: ${t.message}`}
              onClick={t.action.onClick}
              className="shrink-0 rounded-sm px-1 font-semibold text-powder hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-powder"
            >
              {t.action.label}
            </ToastPrimitive.Action>
          )}
          <ToastPrimitive.Close
            aria-label="Dismiss notification"
            className="shrink-0 rounded-sm p-0.5 text-paper/70 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-powder"
          >
            <X className="h-4 w-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport {...{ [TOAST_VIEWPORT_ATTR]: "" }} className="pointer-events-auto fixed bottom-4 left-1/2 z-[100] m-0 flex w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 list-none flex-col gap-2 p-0 outline-none" />
    </ToastPrimitive.Provider>
  );
}
