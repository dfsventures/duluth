// UI overhaul phase 2 (docs/design/app-ui-overhaul.md, 6.5): the toast store.
// A tiny framework-free store so any client code (hooks, handlers, helpers)
// can call toast.success(...) without prop-drilling; <Toaster /> subscribes.
//
// Kinds and lifetimes (spec 6.5):
//   success  4s
//   info     4s
//   undo     6s, carries an Undo action
//   error    stays until dismissed; optional Retry action

export type ToastKind = "success" | "error" | "info" | "undo";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  description?: string;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. */
  duration: number;
}

/** Errors never auto-dismiss. Radix needs a finite number, so use ~24 days. */
export const STICKY_DURATION = 2_147_483_647;

export const DURATIONS: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  undo: 6000,
  error: STICKY_DURATION,
};

/** Never stack more than this many; the oldest non-error toast is dropped first. */
export const MAX_TOASTS = 4;

type Listener = () => void;

let toasts: ToastItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return toasts;
}

const EMPTY: ToastItem[] = [];
export function getServerToasts(): ToastItem[] {
  return EMPTY;
}

interface ToastOptions {
  description?: string;
  action?: ToastAction;
  duration?: number;
}

function push(kind: ToastKind, message: string, opts: ToastOptions = {}): string {
  const id = `t${++seq}`;
  const item: ToastItem = {
    id,
    kind,
    message,
    description: opts.description,
    action: opts.action,
    duration: opts.duration ?? DURATIONS[kind],
  };
  let next = [...toasts, item];
  while (next.length > MAX_TOASTS) {
    const drop = next.findIndex((t) => t.kind !== "error");
    next.splice(drop === -1 ? 0 : drop, 1);
  }
  toasts = next;
  emit();
  return id;
}

export function dismissToast(id: string) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function clearToasts() {
  toasts = [];
  emit();
}

export const toast = {
  success: (message: string, opts?: ToastOptions) => push("success", message, opts),
  info: (message: string, opts?: ToastOptions) => push("info", message, opts),
  /** An error stays until dismissed. Pass `retry` only when the action is idempotent. */
  error: (message: string, opts?: ToastOptions & { retry?: () => void }) =>
    push("error", message, {
      ...opts,
      action: opts?.action ?? (opts?.retry ? { label: "Retry", onClick: opts.retry } : undefined),
    }),
  /** A reversible action that already happened; Undo reverses it. */
  undo: (message: string, onUndo: () => void, opts?: Omit<ToastOptions, "action">) =>
    push("undo", message, { ...opts, action: { label: "Undo", onClick: onUndo } }),
  dismiss: dismissToast,
};
