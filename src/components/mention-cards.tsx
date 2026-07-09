"use client";

import { useEffect } from "react";
import type { MentionSnapshot } from "@/lib/report-snapshot";

export type MentionCardData = MentionSnapshot & { portfolioCompanyId: string };

interface MentionCardsProps {
  mentions: MentionCardData[];
}

function formatCompactUsd(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function headline(m: MentionCardData): string {
  if (m.sinceFirstCheckMultiple === null) return "—";
  if (m.sinceFirstCheckMultiple === 0) return "Written off";
  return `${m.sinceFirstCheckMultiple.toFixed(1)}× since first check (${monthYear(m.firstDealDate)})`;
}

/**
 * Hover/tap cards over portfolio-company mentions (Part 7, WS18.5 design,
 * built here in WS17 so the admin preview shows the real thing). Plain
 * DOM/React state — no new UI dep; Radix popovers need declarative
 * triggers we don't have inside `dangerouslySetInnerHTML`.
 *
 * Q6 (decided 2026-07-08): headline is the SINCE-FIRST-CHECK multiple, not
 * blended, with a per-deal breakdown beneath. Full detail: DFS check
 * sizes, multiples, AND entry -> current valuations in dollars.
 */
export function MentionCards({ mentions }: MentionCardsProps) {
  useEffect(() => {
    const container = document.querySelector(".report-body");
    if (!container) return;

    const byId = new Map(mentions.map((m) => [m.portfolioCompanyId, m]));
    const spans = Array.from(container.querySelectorAll<HTMLElement>("[data-portco]"));

    let card: HTMLDivElement | null = null;

    function closeCard() {
      card?.remove();
      card = null;
    }

    function openCard(span: HTMLElement, snapshot: MentionCardData) {
      closeCard();
      card = document.createElement("div");
      card.className =
        "fixed z-50 w-72 rounded-md border border-border bg-card p-4 text-sm shadow-lg";
      card.setAttribute("role", "dialog");

      const rect = span.getBoundingClientRect();
      card.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
      card.style.top = `${rect.bottom + 6}px`;

      const nameEl = document.createElement("p");
      nameEl.className = "font-display text-base tracking-tight text-foreground";
      nameEl.textContent = snapshot.companyName;
      card.appendChild(nameEl);

      const headlineEl = document.createElement("p");
      headlineEl.className = "mt-1 font-display text-lg tracking-tight text-primary-700";
      headlineEl.textContent = headline(snapshot);
      card.appendChild(headlineEl);

      const dollarsEl = document.createElement("p");
      dollarsEl.className = "mt-0.5 font-mono text-xs text-muted-foreground";
      dollarsEl.textContent = `${formatCompactUsd(snapshot.firstCheckEntryValuationUsd)} → ${formatCompactUsd(snapshot.firstCheckCurrentValuationUsd)}`;
      card.appendChild(dollarsEl);

      const list = document.createElement("div");
      list.className = "mt-3 space-y-1 border-t border-border pt-2";
      snapshot.deals.forEach((d) => {
        const row = document.createElement("p");
        row.className = "font-mono text-xs text-muted-foreground";
        const typeLabel = d.investmentType === "INITIAL" ? "Initial" : "Follow-on";
        const multipleLabel = d.multiple === null ? "n/a" : d.multiple === 0 ? "written off" : `${d.multiple.toFixed(1)}×`;
        row.textContent = `${typeLabel} · ${monthYear(d.dealDate)} · ${formatCompactUsd(d.amountUsd)} check · ${multipleLabel}`;
        list.appendChild(row);
      });
      card.appendChild(list);

      document.body.appendChild(card);
    }

    const cleanups: Array<() => void> = [];

    spans.forEach((span) => {
      const id = span.getAttribute("data-portco");
      const snapshot = id ? byId.get(id) : undefined;
      if (!snapshot) return;

      span.setAttribute("tabindex", "0");

      const onEnter = () => openCard(span, snapshot);
      const onLeave = () => closeCard();
      const onClick = (e: Event) => {
        e.stopPropagation();
        if (card) closeCard();
        else openCard(span, snapshot);
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") closeCard();
      };

      span.addEventListener("mouseenter", onEnter);
      span.addEventListener("mouseleave", onLeave);
      span.addEventListener("focus", onEnter);
      span.addEventListener("blur", onLeave);
      span.addEventListener("click", onClick);
      span.addEventListener("keydown", onKeyDown);

      cleanups.push(() => {
        span.removeEventListener("mouseenter", onEnter);
        span.removeEventListener("mouseleave", onLeave);
        span.removeEventListener("focus", onEnter);
        span.removeEventListener("blur", onLeave);
        span.removeEventListener("click", onClick);
        span.removeEventListener("keydown", onKeyDown);
      });
    });

    const onDocClick = () => closeCard();
    document.addEventListener("click", onDocClick);

    return () => {
      cleanups.forEach((fn) => fn());
      document.removeEventListener("click", onDocClick);
      closeCard();
    };
  }, [mentions]);

  return null;
}
