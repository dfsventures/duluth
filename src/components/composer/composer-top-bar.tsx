"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ComposerOverflowItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ComposerTopBarProps {
  /** Mono muted label, e.g. "Draft" or "Draft in Acme Inc". */
  draftLabel: string;
  /** Ambient save-state text (Saving… / Saved · 2:41 PM / Unsaved changes). */
  saveStateLabel?: string;
  /** Extra buttons rendered before Publish — e.g. "Save as Draft", "Cancel". */
  secondaryActions?: React.ReactNode;
  publishLabel?: string;
  onPublishClick: () => void;
  publishDisabled?: boolean;
  publishing?: boolean;
  overflowItems?: ComposerOverflowItem[];
}

/**
 * Slim in-content header row for the three update composers (Part 8,
 * WS20). The AppShell sidebar stays (Q17 = A) — this replaces the old
 * boxed "Create New Update" card header, not the app chrome.
 */
export function ComposerTopBar({
  draftLabel,
  saveStateLabel,
  secondaryActions,
  publishLabel = "Publish",
  onPublishClick,
  publishDisabled,
  publishing,
  overflowItems,
}: ComposerTopBarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    function onClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [overflowOpen]);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="flex flex-wrap items-baseline gap-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        <span>{draftLabel}</span>
        {saveStateLabel && <span className="normal-case tracking-normal text-muted-foreground/80">{saveStateLabel}</span>}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {secondaryActions}
        <Button size="sm" disabled={publishDisabled || publishing} onClick={onPublishClick}>
          {publishing ? "Publishing..." : publishLabel}
        </Button>

        {overflowItems && overflowItems.length > 0 && (
          <div className="relative" ref={overflowRef}>
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="More actions"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-border bg-card py-1 shadow-lg">
                {overflowItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      setOverflowOpen(false);
                      item.onClick();
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm transition-colors disabled:opacity-40",
                      item.danger ? "text-laterite hover:bg-laterite/10" : "text-foreground hover:bg-muted"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
