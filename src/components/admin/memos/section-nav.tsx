"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const CONTROL =
  "h-8 w-full rounded-ctl border border-input bg-card py-0 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Part 44 (WS146.4): the section list tracks the section in view; phones get a Jump to select.
export function SectionNav({ sections }: { sections: { key: string; title: string }[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.key ?? null);
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(`section-${s.key}`)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id.replace(/^section-/, ""));
      },
      { rootMargin: "-96px 0px -60% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  function jump(key: string) {
    setActive(key);
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#section-${key}`);
  }

  return (
    <>
      <nav aria-label="Sections" className="memo-no-print hidden lg:block">
        <ol className="sticky top-6 space-y-1 text-sm">
          {sections.map((s) => {
            const on = s.key === active;
            return (
              <li key={s.key}>
                <a
                  href={`#section-${s.key}`}
                  aria-current={on ? "location" : undefined}
                  onClick={() => setActive(s.key)}
                  className={cn(
                    "block truncate border-l-2 py-1 pl-2 hover:text-foreground",
                    on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground"
                  )}
                >
                  {s.title}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="memo-no-print mb-4 lg:hidden">
        <label htmlFor="memo-jump" className="label mb-1 block">
          Jump to
        </label>
        <select id="memo-jump" className={CONTROL} value={active ?? ""} onChange={(e) => jump(e.target.value)}>
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
