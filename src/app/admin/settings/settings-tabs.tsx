import Link from "next/link";
import { cn } from "@/lib/utils";

import { SETTINGS_TABS, settingsTabHref, type SettingsTab } from "./settings-tabs-util";

// Same classes as the Team Board tab strip so the two pages read as siblings.
export function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav
      aria-label="Settings sections"
      className="mb-6 flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none] v2:border-b-0"
    >
      {SETTINGS_TABS.map((t) => (
        <Link
          key={t.value}
          href={settingsTabHref(t.value)}
          scroll={false}
          aria-current={t.value === active ? "page" : undefined}
          className={cn(
            "shrink-0 border-b-2 border-transparent px-1 pb-2.5 pt-1 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground v2:px-0 v2:py-2.5 v2:font-sans v2:text-row v2:font-medium v2:normal-case v2:tracking-normal",
            t.value === active && "border-foreground text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
