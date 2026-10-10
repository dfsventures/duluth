"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ignoreToastInteraction } from "@/lib/toast-guard";

/**
 * UI overhaul phase 2: the one Dialog (focused task, 480 / 640px). Radix gives
 * focus trap, Escape, focus return and scroll lock. Below `sm` it becomes a
 * full-width bottom sheet. The panel sits INSIDE the overlay (a flex box) so the
 * enter/exit transform animation never fights a centring transform.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIZES = { sm: "sm:max-w-[480px]", md: "sm:max-w-[560px]", lg: "sm:max-w-[640px]" } as const;

export interface DialogContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "title"> {
  title: string;
  description?: string;
  size?: keyof typeof SIZES;
  /** Hide the visible title (it stays available to screen readers). */
  hideTitle?: boolean;
  hideClose?: boolean;
}

export function DialogContent({
  title,
  description,
  size = "sm",
  hideTitle,
  hideClose,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-obsidian/35 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out sm:items-center sm:p-4">
        <DialogPrimitive.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onInteractOutside={ignoreToastInteraction}
          className={cn(
            "relative w-full border border-border bg-card shadow-float",
            "max-h-[92dvh] overflow-y-auto rounded-t-sm sm:rounded-sm",
            "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
            SIZES[size],
            className
          )}
          {...props}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title
                className={cn("font-display text-heading text-foreground", hideTitle && "sr-only")}
              >
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            {!hideClose && (
              <DialogPrimitive.Close
                aria-label="Close"
                className="-mr-2 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            )}
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

/**
 * Drop-in for the hand-built `Modal({ title, onClose, children })` that lived in a
 * dozen pages: always open while mounted, closes via `onClose` (Escape, scrim,
 * X). Use `<Dialog>` directly when the exit animation matters.
 */
export function ModalDialog({
  title,
  onClose,
  size = "md",
  children,
}: {
  title: string;
  onClose: () => void;
  size?: keyof typeof SIZES;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} size={size}>
        <DialogBody>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
