// A modal Dialog treats any click or focus outside itself as "dismiss". The
// toast viewport lives outside every dialog, so pressing a toast's Undo or
// Retry while a dialog was open used to close the dialog (found in phase 2,
// fixed in phase 6). Dialogs call this from onInteractOutside.

export const TOAST_VIEWPORT_ATTR = "data-molly-toaster";

interface Targetish {
  closest?: (selector: string) => unknown;
}

export function isToastTarget(target: EventTarget | Targetish | null | undefined): boolean {
  const el = target as Targetish | null | undefined;
  return Boolean(el?.closest?.(`[${TOAST_VIEWPORT_ATTR}]`));
}

/** Pass to a Radix Dialog's `onInteractOutside`. */
export function ignoreToastInteraction(e: { target: EventTarget | null; preventDefault: () => void }) {
  if (isToastTarget(e.target)) e.preventDefault();
}
