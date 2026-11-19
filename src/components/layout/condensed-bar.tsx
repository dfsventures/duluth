"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const CONDENSED_SLOT = "data-condensed-slot";

/**
 * Page types v1, D3: on List and Detail pages a slim 52px bar slides in once the page's h1 has
 * scrolled out of view, carrying the title and the main action at 32px. It renders into the slot
 * AppShell keeps at the top of the page frame (a sticky, zero-height box), so it needs no space of
 * its own. The slot is drawn only under the new look (CSS), so the old look never shows the bar.
 *
 * `headId` is the id of the in-page header it watches.
 */
export function CondensedBar({
  headId,
  title,
  back,
  action,
}: {
  headId: string;
  title: string;
  back?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const head = document.getElementById(headId);
    const s = head?.closest(".shell-page")?.querySelector<HTMLElement>(`[${CONDENSED_SLOT}]`) ?? null;
    setSlot(s);
    const h1 = head?.querySelector("h1");
    const root = document.getElementById("main-content");
    if (!h1 || !root || typeof IntersectionObserver === "undefined") return;
    // The title has scrolled away once no part of it is below the top edge of the scroll area.
    const io = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) + 1),
      { root, threshold: 0 }
    );
    io.observe(h1);
    return () => io.disconnect();
  }, [headId]);

  if (!slot) return null;
  return createPortal(
    <div className="condensed-bar" data-shown={shown ? "true" : "false"} aria-hidden={shown ? undefined : true}>
      <div className="condensed-bar-inner">
        {back && (
          <Link href={back.href} aria-label={back.label} tabIndex={shown ? undefined : -1} className="condensed-back">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
        <p className="min-w-0 flex-1 truncate text-row font-semibold text-foreground">{title}</p>
        {action && <div className="condensed-actions">{action}</div>}
      </div>
    </div>,
    slot
  );
}
