"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Link2, Link2Off, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Props {
  name: string;
  country: string | null;
  latestValuation: number | null;
  /** The linked Molly account, or null. */
  linked: { id: string; name: string } | null;
  onNewRound: () => void;
  onLink: () => void;
  onUnlink: () => void;
  /** Quiet notices under the title (the unlink confirmation). */
  notices: ReactNode;
  /** The sections: contacts, positions, deals, rounds, valuation history. */
  children: ReactNode;
}

/**
 * A Deal Ledger company's page in the new look (B-133), laid out like the memo, company and update
 * pages: header bar (back, the one primary, ⋯), then a 720px column of sections and a sticky 296px
 * panel with the company's properties. Geometry lives in globals.css under `.dl-dossier`. Under 1040px
 * the panel sits under the title.
 */
export function DealRecord({ name, country, latestValuation, linked, onNewRound, onLink, onUnlink, notices, children }: Props) {
  const rows: { label: string; value: ReactNode }[] = [];
  if (country) rows.push({ label: "Country", value: country });
  if (latestValuation !== null) rows.push({ label: "Latest valuation", value: `$${latestValuation.toLocaleString()}` });
  rows.push({
    label: "Molly account",
    value: linked ? (
      <Link href={`/admin/companies/${linked.id}`} className="text-primary underline-offset-4 hover:underline">
        {linked.name}
      </Link>
    ) : (
      <span className="text-muted-foreground">Not linked</span>
    ),
  });

  return (
    // The page is AppShell width="full" (no padding): the vertical padding the page box gave is here.
    <div className="dl-dossier v2:py-6 md:v2:py-8">
      <div className="mb-6 flex h-9 items-center gap-2">
        <Link
          href="/admin/portfolio"
          className="inline-flex h-9 items-center gap-1.5 rounded-ctl pr-2 text-meta text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Deal Ledger
        </Link>
        <span className="flex-1" />
        <Button variant="primary" onClick={onNewRound}>
          <Plus className="h-4 w-4" />
          New round
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="More actions">
              <MoreHorizontal aria-hidden className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {linked ? (
              <>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/companies/${linked.id}`}>
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                    View operational company profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onUnlink} className="text-destructive">
                  <Link2Off aria-hidden className="h-3.5 w-3.5" />
                  Unlink Molly account
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={onLink}>
                <Link2 aria-hidden className="h-3.5 w-3.5" />
                Link to a Molly account…
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <header className="mb-6">
        <h1 className="break-words font-sans text-title font-semibold text-foreground">{name}</h1>
      </header>

      {notices && <div className="mb-6">{notices}</div>}

      <div className="dl-dossier-grid">
        <aside aria-label="Company details" className="dl-aside">
          <div className="rounded-lg bg-muted/60 p-4 v2:bg-card">
            <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-row">
              {rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="pt-0.5 text-meta text-muted-foreground">{r.label}</dt>
                  <dd className="min-w-0 break-words text-row text-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        <div className="dl-main min-w-0">{children}</div>
      </div>
    </div>
  );
}
