"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FundPerformanceCard } from "@/components/fund-performance-card";
import type { FundSnapshotPayload } from "@/lib/portfolio-metrics";

/**
 * Part 14, WS36.2 — sibling of MentionCards (mention-cards.tsx): "find the
 * marker after mount, render the real thing over it" shape, but a portal
 * into the marker element rather than hand-built DOM, since the real
 * content here is a full React component tree (stat strip + table), not
 * four lines of text.
 *
 * Renders nothing until both `data` (the fund-performance snapshot — frozen
 * on the LP page, live-computed in the admin preview, per WS35) and the
 * `[data-fund-snapshot]` marker element (rendered by the report body's own
 * HTML, via FundSnapshotNode's static placeholder markup) are present.
 */
export function FundSnapshotBlock({ data }: { data: FundSnapshotPayload | null }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".report-body [data-fund-snapshot]");
    // A portal only adds to `el`, it doesn't clear it — without this, the
    // node's static "Fund performance snapshot — ... (updates when
    // published)" placeholder text (rendered by FundSnapshotNode for the
    // editor) would sit permanently above the real card in every rendered
    // view, including post-publish.
    if (el && data) el.textContent = "";
    setTarget(el);
  }, [data]);

  if (!data || !target) return null;
  return createPortal(
    <FundPerformanceCard
      performance={data.performance}
      deals={data.deals}
      fundName={data.fundName}
      showCaveat={false}
      overrides={data.performanceOverride}
    />,
    target
  );
}
