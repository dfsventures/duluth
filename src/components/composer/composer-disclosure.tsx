"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComposerDisclosureProps {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** Extra classes for the wrapper (a `v2:` class to drop the top rule under the new look). */
  className?: string;
}

/** Same chevron-toggle pattern as the existing "Schedule for later" disclosure. */
export function ComposerDisclosure({ label, defaultOpen = false, children, className }: ComposerDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("border-t pt-4", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        {label}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
