"use client";

import { ChevronDown } from "lucide-react";
import { BrandButton, CompanyChip, CompanyLogo, SectionLabel, ThemeBand, ThemeScope } from "./company-brand";
import type { BrandTheme, LogoPlate } from "@/lib/brand-theme";

/**
 * Live preview of the share page header, a feed row and the email-gate button,
 * built from the same components as /share/[token]. Sample figures only.
 */
export function ShareThemePreview({
  name,
  theme,
  plate,
  logoUrl,
  square,
}: {
  name: string;
  theme: BrandTheme | null;
  plate: LogoPlate;
  logoUrl: string | null;
  square?: boolean;
}) {
  return (
    <ThemeScope theme={theme} className="overflow-hidden rounded-lg border border-edge bg-[#ebe8de]" >
      <div aria-hidden="true" data-testid="share-theme-preview">
        <ThemeBand themed={!!theme} />
        <div className="space-y-4 p-4 sm:p-5">
          <CompanyLogo name={name || "Your company"} logoUrl={logoUrl} plate={plate} square={square} />
          <div className="rounded-lg bg-white p-4 shadow-soft">
            <SectionLabel>Updates (2)</SectionLabel>
            <div className="co-strip mt-3 flex flex-wrap gap-5 rounded-md px-3 py-2.5">
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-sm font-semibold text-foreground">120,000 <span className="text-xs font-normal text-muted-foreground">USD</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customers</p>
                <p className="text-sm font-semibold text-foreground">48</p>
              </div>
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sep 30, 2026</span>
                  <CompanyChip>{name || "Your company"}</CompanyChip>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-foreground">Q3 update</p>
                <p className="co-body mt-1 text-xs text-muted-foreground">
                  We signed three new partners. <a href="#preview" tabIndex={-1}>Read the full note</a>
                </p>
              </div>
              <ChevronDown className="co-chevron mt-1 h-4 w-4 shrink-0" />
            </div>
          </div>
          <BrandButton theme={theme} size="sm" type="button" tabIndex={-1}>
            View update
          </BrandButton>
        </div>
      </div>
    </ThemeScope>
  );
}
