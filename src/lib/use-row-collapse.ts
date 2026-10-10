"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collapseDelay, prefersReducedMotion } from "@/lib/row-collapse";

/**
 * Plays the row-removal collapse, then runs `done` (which actually removes the
 * row from the data). Put `className(id)` on the row; pass the row element to
 * `run` so the animation starts from its real height.
 */
export function useRowCollapse() {
  const [collapsing, setCollapsing] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const run = useCallback((id: string, row: Element | null, done: () => void) => {
    const delay = collapseDelay(prefersReducedMotion());
    if (delay === 0) {
      done();
      return;
    }
    if (row instanceof HTMLElement) row.style.setProperty("--row-h", `${row.offsetHeight}px`);
    setCollapsing((prev) => new Set(prev).add(id));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setCollapsing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      done();
    }, delay);
    timers.current.add(timer);
  }, []);

  // Table rows cannot animate their height, so they fade; list items collapse.
  const className = useCallback(
    (id: string, variant: "collapse" | "fade" = "collapse") =>
      collapsing.has(id) ? (variant === "fade" ? "animate-row-fade" : "animate-row-out overflow-hidden") : "",
    [collapsing]
  );

  return { run, className, isCollapsing: (id: string) => collapsing.has(id) };
}
