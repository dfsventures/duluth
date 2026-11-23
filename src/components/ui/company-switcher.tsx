"use client";

import { useState } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/company-context";

export function CompanySwitcher() {
  const { companies, selectedCompany, setSelectedCompanyId } = useCompany();
  const [open, setOpen] = useState(false);

  if (companies.length <= 1) return null;

  return (
    // New look (PLAN-1, WS165): the switcher stays at the top of the founder sidebar, drawn as a 36px
    // control like the admin's search box (44px on phones), and its menu rows match the nav.
    <div className="relative px-3 pb-2 v2:pb-3 v2:pt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-sm hover:bg-muted transition-colors v2:h-9 v2:rounded v2:border v2:border-[var(--color-border-hover)] v2:bg-background v2:px-3 v2:py-0 v2:text-row v2:hover:bg-row-hover max-md:v2:h-11"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground v2:h-3.5 v2:w-3.5" />
        <span className="flex-1 truncate text-left font-medium text-foreground">
          {selectedCompany?.name ?? "Select company"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 v2:h-3.5 v2:w-3.5",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 z-20 mt-1 overflow-hidden rounded-float border border-edge bg-card shadow-float v2:bg-background v2:py-1">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCompanyId(c.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors v2:h-9 v2:py-0 v2:text-row v2:hover:bg-row-hover max-md:v2:h-11"
              >
                <span className="flex-1 truncate text-left text-foreground">{c.name}</span>
                {c.id === selectedCompany?.id && (
                  <Check className="h-4 w-4 text-primary-600 v2:text-[var(--color-accent)]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
