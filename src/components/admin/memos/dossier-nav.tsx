"use client";

import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/row-collapse";

export interface NavSection {
  key: string;
  title: string;
  hidden: boolean;
}

const SELECT =
  "h-9 w-full rounded-ctl border border-input bg-card py-0 pl-3 text-row text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Which section is in view, and a jump that scrolls to one. Shared by the contents list and the phone's Jump to. */
export function useActiveSection(sections: NavSection[], onBeforeJump?: (key: string) => void) {
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
    onBeforeJump?.(key);
    // A script's "smooth" beats the CSS reduced-motion guard, so it is decided here (WS167).
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#section-${key}`);
  }
  return { active, jump };
}

/** The contents list in the panel. The active section gets the Sky underscore, not a left bar. */
export function DossierContents({ sections, active, onJump }: { sections: NavSection[]; active: string | null; onJump: (key: string) => void }) {
  return (
    <nav aria-label="Sections">
      <h3 className="mb-1 text-meta font-medium text-muted-foreground">Contents</h3>
      <ol className="text-body-sm">
        {sections.map((s) => {
          const on = s.key === active;
          return (
            <li key={s.key}>
              <a
                href={`#section-${s.key}`}
                aria-current={on ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onJump(s.key);
                }}
                className={cn(
                  "flex h-7 min-w-0 items-center gap-2 rounded-ctl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on && "font-medium text-foreground"
                )}
              >
                <span aria-hidden="true" className={cn("h-0.5 w-2 shrink-0 bg-mark transition-opacity", on ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 truncate">{s.title}</span>
                {s.hidden && <EyeOff aria-label="Hidden from share links" className="ml-auto h-3 w-3 shrink-0" />}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Phone and narrow windows: a native select that jumps to a section. */
export function JumpTo({ sections, active, onJump }: { sections: NavSection[]; active: string | null; onJump: (key: string) => void }) {
  return (
    <div className="memo-jump memo-no-print sticky top-0 z-10 -mx-1 mb-4 bg-background px-1 py-2">
      <label htmlFor="memo-jump" className="sr-only">
        Jump to
      </label>
      <select id="memo-jump" className={SELECT} value={active ?? ""} onChange={(e) => onJump(e.target.value)}>
        {sections.map((s) => (
          <option key={s.key} value={s.key}>
            {`Jump to: ${s.title}`}
          </option>
        ))}
      </select>
    </div>
  );
}
