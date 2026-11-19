"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
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
  /** Set false for a sent or published record that has nothing left to publish: no primary button. */
  showPublish?: boolean;
  /** New look: the "‹ Broadcasts" link at the start of the bar (the page drops its breadcrumb). */
  back?: { href: string; label: string };
  /** More status text after the label, e.g. an amber "Unsaved changes". */
  statusExtra?: React.ReactNode;
  /** New look: why the primary is disabled, as a muted line under the bar's actions (audit #19). */
  disabledReason?: string;
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
  showPublish = true,
  back,
  statusExtra,
  disabledReason,
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
    // New look (audit #8, #20): the record header. A sticky 52px bar (the .shell-header rules give it the
    // hairline, the bleed and the stick when it is the first thing on the page) with a "‹ Back" link and
    // the status on the left and the actions on the right. Sentence-case status in sans.
    <div className="shell-header mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4 v2:mb-6 v2:min-h-9 v2:pb-0">
      <div className="flex flex-wrap items-baseline gap-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground v2:font-sans v2:text-meta v2:normal-case v2:tracking-normal">
        {back && (
          <Link
            href={back.href}
            className="hidden items-center gap-0.5 text-row text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring v2:inline-flex"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            {back.label}
          </Link>
        )}
        <span>{draftLabel}</span>
        {saveStateLabel && <span className="normal-case tracking-normal text-muted-foreground/80">{saveStateLabel}</span>}
        {statusExtra}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {secondaryActions}
        {showPublish && (
          <Button size="sm" disabled={publishDisabled || publishing} onClick={onPublishClick}>
            {publishing ? "Publishing..." : publishLabel}
          </Button>
        )}

        {overflowItems && overflowItems.length > 0 && (
          <div className="relative" ref={overflowRef}>
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors v2:flex v2:h-9 v2:w-9 v2:items-center v2:justify-center v2:rounded-ctl"
              title="More actions"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-float border border-edge bg-card py-1 shadow-float">
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
                      item.danger ? "text-tone-clay-ink hover:bg-laterite/10" : "text-foreground hover:bg-muted"
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
      {disabledReason && publishDisabled && showPublish && (
        <p className="hidden basis-full text-right text-meta text-muted-foreground v2:block">{disabledReason}</p>
      )}
    </div>
  );
}
