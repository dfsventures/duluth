"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ComposerDisclosureProps {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Same chevron-toggle pattern as the existing "Schedule for later" disclosure. */
export function ComposerDisclosure({ label, defaultOpen = false, children }: ComposerDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t pt-4">
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
