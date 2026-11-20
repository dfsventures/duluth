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
  /** Optional only for a bar with showPublish={false} (a server page can't pass a handler). */
  onPublishClick?: () => void;
  publishDisabled?: boolean;
  publishing?: boolean;
  overflowItems?: ComposerOverflowItem[];
  /** Set false for a sent or published record that has nothing left to publish: no primary button. */
  showPublish?: boolean;
  /** New look: the "‹ Broadcasts" link at the start of the bar (the page drops its breadcrumb). */
  back?: { href: string; label: string };
  /** More status text after the label, e.g. an amber "Unsaved changes". */
  statusExtra?: React.ReactNode;
  /** Why the primary is disabled: a tooltip on the button (the page may also show it as a quiet line). */
  disabledReason?: string;
  /** The bar is drawn only under the new look (a page that had no bar in the old look). */
  newLookOnly?: boolean;
  /**
   * New look on phones (page types v1, §6): the same actions as `secondaryActions`, as menu items. When
   * given, the secondary buttons are hidden below md and these items lead the "⋯" menu instead, so the
   * bar keeps the back chevron, the status, the primary and ⋯. Desktop and the old look are unchanged.
   */
  phoneMenuItems?: ComposerOverflowItem[];
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
  newLookOnly,
  phoneMenuItems,
}: ComposerTopBarProps) {
  const phoneItems = phoneMenuItems ?? [];
  const menuItems: (ComposerOverflowItem & { phoneOnly?: boolean })[] = [
    ...phoneItems.map((i) => ({ ...i, phoneOnly: true })),
    ...(overflowItems ?? []),
  ];
  // Only phone items: the ⋯ exists on phones under the new look only.
  const phoneOnlyMenu = !overflowItems?.length && phoneItems.length > 0;
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
    // Same rhythm as PageHeader: the bar's height, padding and bottom margin come from .shell-header alone.
    // Page types v1 (§4.3, §5): one text size (14/20), items centred on one line (not baselines), a
    // 1x16 divider after the back link, buttons 32. The status truncates; the buttons never wrap.
    <div className={`shell-header editor-bar mb-6 ${newLookOnly ? "hidden v2:flex" : "flex"} flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b pb-4 v2:pb-0`}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground v2:flex-1 v2:flex-nowrap v2:items-center v2:font-sans v2:text-row v2:normal-case v2:tracking-normal">
        {back && (
          <>
            <Link
              href={back.href}
              data-align="back"
              className="hidden h-5 shrink-0 items-center gap-1 text-row text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring v2:-ml-1 v2:inline-flex max-md:v2:h-11 max-md:v2:w-11 max-md:v2:justify-center"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <span className="max-md:v2:sr-only">{back.label}</span>
            </Link>
            <span aria-hidden="true" className="hidden h-4 w-px shrink-0 bg-[var(--color-border-hover)] v2:block" />
          </>
        )}
        <span className="v2:min-w-0 v2:truncate">
          <span className="v2:font-medium v2:text-secondary">{draftLabel}</span>
          {saveStateLabel && (
            <span className="ml-3 normal-case tracking-normal text-muted-foreground/80 v2:ml-0 v2:text-muted-foreground">
              <span className="hidden v2:inline"> · </span>
              {saveStateLabel}
            </span>
          )}
        </span>
        {statusExtra && <span className="v2:shrink-0 v2:truncate">{statusExtra}</span>}
      </div>

      <div data-align="actions" className="flex flex-wrap items-center justify-end gap-2 v2:shrink-0 v2:flex-nowrap">
        {phoneItems.length > 0 ? <div className="contents max-md:v2:hidden">{secondaryActions}</div> : secondaryActions}
        {showPublish && (
          <Button
            size="sm"
            disabled={publishDisabled || publishing}
            onClick={onPublishClick}
            title={publishDisabled && disabledReason ? disabledReason : undefined}
          >
            {publishing ? "Publishing..." : publishLabel}
          </Button>
        )}

        {menuItems.length > 0 && (
          <div className={phoneOnlyMenu ? "relative hidden max-md:v2:block" : "relative"} ref={overflowRef}>
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors v2:flex v2:h-8 v2:w-8 v2:items-center v2:justify-center v2:rounded-ctl"
              title="More actions"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-float border border-edge bg-card py-1 shadow-float">
                {menuItems.map((item) => (
                  <button
                    key={`${item.phoneOnly ? "phone-" : ""}${item.label}`}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      setOverflowOpen(false);
                      item.onClick();
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm transition-colors disabled:opacity-40",
                      item.phoneOnly && "hidden max-md:v2:block",
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
    </div>
  );
}
