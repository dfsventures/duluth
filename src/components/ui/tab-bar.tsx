"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { tabHref } from "@/lib/url-tab";

export interface TabDef<T extends string> {
  key: T;
  label: string;
  icon?: React.ReactNode;
  /** Mono numeral after the label. */
  count?: number;
}

/**
 * Tabs whose state is the URL (?tab=key). Each tab is a real link, so the back
 * button, middle-click and shared links all work; the default tab keeps a clean
 * URL. The 2px indicator slides between tabs (transform only; instant under
 * reduced motion via the global guard).
 */
export function TabBar<T extends string>({
  tabs,
  active,
  fallback,
  label,
  className,
}: {
  tabs: TabDef<T>[];
  active: T;
  fallback: T;
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);

  useEffect(() => {
    function measure() {
      const el = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, tabs.length]);

  return (
    <nav aria-label={label} className={cn("mb-6 overflow-x-auto border-b border-border", className)}>
      <div ref={listRef} className="relative flex gap-6">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={tabHref(pathname, searchParams, t.key, fallback)}
              replace
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span className="num font-mono text-label font-medium text-muted-foreground">{t.count}</span>
              )}
            </Link>
          );
        })}
        {bar && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-px origin-left bg-foreground transition-transform duration-slow ease-out"
            style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w})` }}
          />
        )}
      </div>
    </nav>
  );
}
