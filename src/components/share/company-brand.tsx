"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { themeCssVars, type BrandTheme, type LogoPlate } from "@/lib/brand-theme";

/**
 * Themed building blocks shared by the share page and the live preview in
 * company settings, so the preview cannot drift from production. Colours come
 * from --co-* custom properties (see "Company theming" in globals.css); with no
 * theme the fallbacks are the DFS tokens.
 */

/** Sets the --co-* variables for everything inside. No theme = DFS look. */
export function ThemeScope({
  theme,
  className,
  children,
}: {
  theme: BrandTheme | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className} style={theme ? themeCssVars(theme) : undefined}>
      {children}
    </div>
  );
}

/** 6px full-width top band. Decorative. */
export function ThemeBand({ themed }: { themed: boolean }) {
  return <div aria-hidden="true" className="co-band h-1.5 w-full" data-themed={themed || undefined} />;
}

function Monogram({ name, small }: { name: string; small?: boolean }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "co-monogram inline-flex shrink-0 items-center justify-center rounded-lg font-display font-semibold",
        small ? "h-8 w-8 text-sm" : "h-9 w-9 text-base"
      )}
    >
      {initial}
    </span>
  );
}

/**
 * Company logo on its plate, or a monogram + name when there is no logo (or it
 * fails to load). Square marks render as a square; wide logos in a 176x44 plate.
 */
export function CompanyLogo({
  name,
  logoUrl,
  plate,
  size = "header",
  square = false,
}: {
  name: string;
  logoUrl: string | null;
  plate: LogoPlate;
  size?: "header" | "card";
  square?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!logoUrl || failed) {
    return (
      <span className="inline-flex min-w-0 items-center gap-2.5">
        <Monogram name={name} small={size === "card"} />
        <span className="truncate font-display text-base font-semibold text-foreground">{name}</span>
      </span>
    );
  }
  const h = size === "card" ? "h-9" : "h-10 sm:h-11";
  return (
    <span
      className={cn(
        "co-plate inline-flex items-center justify-center rounded-lg border border-black/10 px-3",
        h,
        square ? "aspect-square px-1.5" : size === "card" ? "max-w-[140px]" : "w-44 max-w-full"
      )}
      data-plate={plate}
    >
      {/* Derivatives are PNGs served by /api/logo; next/image adds nothing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={cn("max-w-full object-contain", size === "card" ? "max-h-6" : "max-h-7")}
      />
    </span>
  );
}

/** Company name chip in the feed: tint fill + ink text. */
export function CompanyChip({ children }: { children: React.ReactNode }) {
  return <span className="co-chip inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">{children}</span>;
}

/** Mono-caps section label in the accent ink. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("co-label font-mono text-label font-semibold uppercase tracking-label", className)}>
      {children}
    </h2>
  );
}

/**
 * Primary button in the company colour. Carries the variables itself because
 * it can render inside a portal (the email-gate dialog) that sits outside any
 * ThemeScope.
 */
export function BrandButton({
  theme,
  className,
  style,
  ...props
}: ButtonProps & { theme: BrandTheme | null }) {
  return (
    <Button
      {...props}
      className={cn(theme && "co-btn", className)}
      data-edge={theme?.needsEdge || undefined}
      style={{ ...(theme ? themeCssVars(theme) : {}), ...style }}
    />
  );
}
