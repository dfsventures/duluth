"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TabBar, type TabDef } from "@/components/ui/tab-bar";
import { logoPublicPath } from "@/lib/company-logo";
import type { FlashMessage } from "@/lib/use-flash-message";
import { ProfileCard } from "./profile-card";
import type { Company, Tab } from "./types";

interface Props {
  companyId: string;
  company: Company;
  portfolioCompany: { id: string; name: string } | null;
  /** "No founder yet" note, or null. */
  founderNote: ReactNode;
  tabs: TabDef<Tab>[];
  activeTab: Tab;
  deleting: boolean;
  onDelete: () => void;
  onSaved: (company: Company) => void;
  setMessage: (m: FlashMessage | null) => void;
  /** The active tab's content. */
  children: ReactNode;
}

/**
 * The company page in the new look (B-133), laid out like the memo page's Dossier: header bar (back,
 * the one primary, ⋯), then a 720px column holding the title and the tabs, and a sticky 296px panel
 * with the company's facts. Geometry lives in globals.css under `.co-dossier`. Under 1040px the panel
 * sits under the title.
 */
export function CompanyRecord({ companyId, company, portfolioCompany, founderNote, tabs, activeTab, deleting, onDelete, onSaved, setMessage, children }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const logo = logoPublicPath(company.id, company.logoWebKey);

  return (
    // The page is AppShell width="full" (no padding): the vertical padding the page box gave is here.
    <div className="co-dossier v2:py-6 md:v2:py-8">
      <div className="mb-6 flex h-9 items-center gap-2">
        <Link
          href="/admin/companies"
          className="inline-flex h-9 items-center gap-1.5 rounded-ctl pr-2 text-meta text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Companies
        </Link>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => router.push(`/admin/companies/${companyId}/updates/new`)}>
          <Plus className="h-4 w-4" />
          Create update
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="More actions">
              <MoreHorizontal aria-hidden className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil aria-hidden className="h-3.5 w-3.5" />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} disabled={deleting} className="text-destructive">
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              {deleting ? "Deleting..." : "Delete company"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <header className="mb-6">
        <h1 className="flex items-center gap-3 font-sans text-title font-semibold text-foreground">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-card object-contain" />
          ) : (
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Building2 className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0 break-words">{company.name}</span>
        </h1>
        {founderNote && <div className="mt-3">{founderNote}</div>}
      </header>

      <div className="co-dossier-grid">
        <aside aria-label="Company facts" className="co-aside">
          <ProfileCard
            variant="panel"
            companyId={companyId}
            company={company}
            portfolioCompany={portfolioCompany}
            onSaved={onSaved}
            setMessage={setMessage}
            editing={editing}
            onEditingChange={setEditing}
          />
        </aside>

        <div className="co-main min-w-0">
          <TabBar<Tab> label="Company sections" tabs={tabs} active={activeTab} fallback="updates" />
          {children}
        </div>
      </div>
    </div>
  );
}
