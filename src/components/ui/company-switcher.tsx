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
    <div className="relative px-3 pb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted transition-colors"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left font-medium text-foreground">
          {selectedCompany?.name ?? "Select company"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 z-20 mt-1 overflow-hidden rounded-sm border border-border bg-card shadow-md">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCompanyId(c.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <span className="flex-1 truncate text-left text-foreground">{c.name}</span>
                {c.id === selectedCompany?.id && (
                  <Check className="h-4 w-4 text-primary-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
