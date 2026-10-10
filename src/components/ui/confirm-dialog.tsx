"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { matchesConfirmText } from "@/lib/confirm-text";

export interface ConfirmOptions {
  /** States the object: "Delete this deal". */
  title: string;
  /** The consequence in one sentence. */
  description?: string;
  /** Named for the action ("Delete deal"), never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Laterite confirm button. Default true; pass false for non-destructive confirms. */
  destructive?: boolean;
  /** High-impact deletes (LP, fund, company): the user must type this exactly (case-insensitive). */
  typeToConfirm?: string;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Controlled form, for the rare place that needs to own its state. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = true,
  typeToConfirm,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const unlocked = typeToConfirm ? matchesConfirmText(typed, typeToConfirm) : true;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        title={title}
        description={description}
        size="sm"
        role="alertdialog"
        onOpenAutoFocus={(e) => {
          // Land on the safe choice: Cancel, or the type-to-confirm field.
          e.preventDefault();
          (typeToConfirm ? inputRef.current : cancelRef.current)?.focus();
        }}
      >
        {typeToConfirm && (
          <DialogBody>
            <form
              id="confirm-dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (unlocked) onConfirm();
              }}
            >
              <Input
                ref={inputRef}
                id="confirm-dialog-type"
                label={`Type "${typeToConfirm}" to confirm`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </form>
          </DialogBody>
        )}
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "primary"}
            disabled={!unlocked}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Imperative replacement for window.confirm:
 *   if (!(await confirm({ title, confirmLabel }))) return;
 * Mount <ConfirmProvider> once (root layout).
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  // Keep the last options rendered while the exit animation runs.
  const lastOpts = useRef<ConfirmOptions | null>(null);
  if (state) lastOpts.current = state.opts;

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setState((prev) => {
          prev?.resolve(false); // a second request cancels the first
          return { opts, resolve };
        });
      }),
    []
  );

  const settle = useCallback((value: boolean) => {
    setState((prev) => {
      prev?.resolve(value);
      return null;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const shown = state?.opts ?? lastOpts.current;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {shown && (
        <ConfirmDialog open={!!state} {...shown} onCancel={() => settle(false)} onConfirm={() => settle(true)} />
      )}
    </ConfirmContext.Provider>
  );
}
