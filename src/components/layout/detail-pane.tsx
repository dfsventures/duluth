"use client";

import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { rememberExpandReturn } from "@/lib/shortcuts";

// Detail pane (PLAN-1, WS160, pattern 10). A fixed order: a crumb bar (place and position,
// previous / next, open full page, close), then the title, the property chips, the one thing to
// do in a card with a single primary button, and only after it the explanation, related items and
// history. Sizes are the comfortable-density ones (docs/design/redesign-v1-density.md, "Side pane"):
// crumb 52px; body padding 32 (phone 24 by 20), 48 below; title to chips 16, chips to card 24.
// It renders inside <SplitView>, which only shows it under the new look.

const ICON_BTN =
  "grid h-8 w-8 flex-none place-items-center rounded-ctl text-muted-foreground transition-colors hover:bg-row-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 max-md:h-11 max-md:w-11";

interface DetailPaneProps {
  /** "Approvals · 1 of 3". See crumbLabel() in src/lib/split-view.ts. */
  crumb: string;
  title: string;
  /** A NameTile for the record, shown before the title. */
  mark?: React.ReactNode;
  /** <PaneChip>s. */
  chips?: React.ReactNode;
  /** A <PaneCard>: the one thing to do. */
  card?: React.ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  /** The record's full page (the existing route). */
  expandHref?: string;
  /** <PaneSection>s. */
  children?: React.ReactNode;
}

export function DetailPane({ crumb, title, mark, chips, card, onPrev, onNext, onClose, expandHref, children }: DetailPaneProps) {
  return (
    <>
      <div className="flex h-[var(--bar-h)] flex-none items-center gap-1 border-b border-border pl-6 pr-3 text-meta text-secondary max-md:px-1">
        <button type="button" onClick={onClose} aria-label="Back to the list" className={cn(ICON_BTN, "md:hidden")}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <span className="min-w-0 truncate">{crumb}</span>
        <span className="flex-1" />
        <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous" className={ICON_BTN}>
          <ChevronUp aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next" className={ICON_BTN}>
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
        {expandHref && (
          <Link
            href={expandHref}
            aria-label="Open full page"
            className={ICON_BTN}
            // Esc on the full page comes back here, with this record still open (PLAN-1, WS164).
            onClick={() => rememberExpandReturn(expandHref)}
          >
            <Maximize2 aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className={cn(ICON_BTN, "max-md:hidden")}>
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--pane-gutter)] pb-12 pt-8 max-md:px-5 max-md:pt-6">
        <div className="max-w-[720px]">
          <h2 className="flex items-center gap-3 text-pane-title text-foreground">
            {mark}
            <span className="min-w-0 break-words">{title}</span>
          </h2>
          {chips && <div className="mt-4 flex flex-wrap gap-2">{chips}</div>}
          {card && <div className="mt-6">{card}</div>}
          <div className={cn("space-y-8", (chips || card) && "mt-8")}>{children}</div>
        </div>
      </div>
    </>
  );
}

/** A property chip: 28px, a quiet tier. Pass `tone` classes (a stage tint) to colour one. */
export function PaneChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded bg-card px-3 text-meta text-secondary", className)}>
      {children}
    </span>
  );
}

/**
 * The action card: a heading, one or two sentences, then the buttons (the first is the primary).
 * `hot` is the red dog-ear: use it only where something is blocked or stuck (the glyph-and-word
 * heading stays, so it is never colour alone). Space below is 32.
 */
export function PaneCard({
  heading,
  hot,
  actions,
  children,
}: {
  heading: React.ReactNode;
  hot?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-lg bg-card p-6",
        // The dog-ear: a 14px red triangle in the top-right corner, clipped by the card's own radius.
        hot &&
          "before:pointer-events-none before:absolute before:right-0 before:top-0 before:h-3.5 before:w-3.5 before:bg-[linear-gradient(225deg,var(--color-stuck)_50%,transparent_50%)] before:content-['']"
      )}
    >
      <h3 className={cn("text-row font-medium text-foreground", hot && "text-[color:var(--color-stuck)]")}>{heading}</h3>
      {children && <div className="mt-2 text-body text-secondary">{children}</div>}
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}

/** A pane section: a 12px muted heading, 12px of space, then the content. Empty sections say so in one line. */
export function PaneSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-meta font-medium text-muted-foreground">{title}</h3>
      <div className="text-body text-secondary">{children}</div>
    </section>
  );
}

/** Label and value pairs: label column 148px, 8 between rows. */
export function PaneDetails({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[148px_1fr] gap-x-3 gap-y-2 max-md:grid-cols-[110px_1fr]">
      {rows.map((r, i) => (
        <div key={`${i}-${r.label}`} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 break-words text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
