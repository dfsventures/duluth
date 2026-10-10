"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Menu on Radix DropdownMenu (already installed): arrow-key movement,
 * type-ahead, Escape, focus return. Floating layer, so it carries the one
 * `float` shadow.
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[11rem] border border-border bg-card p-1 text-[13px] text-foreground shadow-float",
          "data-[state=open]:animate-dialog-in",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 px-3 py-2 outline-none",
        "data-[highlighted]:bg-wash data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        "px-3 pb-1 pt-2 font-mono text-label font-semibold uppercase tracking-label text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
