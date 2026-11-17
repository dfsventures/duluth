"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface SecondaryAction {
  label: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  /** Look of the desktop button; in the phone menu every action is a plain item. */
  variant?: "secondary" | "ghost";
}

/**
 * Secondary header actions. From md up (and in the old look) they are the buttons they always were;
 * on phones in the new look the buttons hide and a "⋯" menu with the same actions shows instead.
 */
export function PageHeaderMenu({ actions }: { actions: SecondaryAction[] }) {
  return (
    <>
      <div className="flex flex-wrap gap-2 max-md:v2:hidden">
        {actions.map((a) => (
          <Button
            key={a.label}
            type="button"
            variant={a.variant ?? "secondary"}
            className={a.variant === "ghost" ? "text-muted-foreground" : undefined}
            onClick={a.onSelect}
          >
            {a.icon}
            {a.label}
          </Button>
        ))}
      </div>
      <div className="hidden max-md:v2:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="secondary" size="icon" aria-label="More actions">
              <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((a) => (
              <DropdownMenuItem key={a.label} onSelect={a.onSelect}>
                {a.icon}
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
