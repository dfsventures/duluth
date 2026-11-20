"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { PageHeader, StatusItems } from "@/components/layout/page-header";
import { DetailMenu } from "@/components/layout/page-header-menu";
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
    // The page is AppShell width="detail": the shared page frame gives the padding and the width.
    <div className="co-dossier">
      {/* Page types v1, Detail: back above the title, the actions on the title row, a status line under it. */}
      <PageHeader
        type="detail"
        back={{ href: "/admin/companies", label: "Companies" }}
        title={company.name}
        indicator={
          logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="order-first h-8 w-8 shrink-0 rounded-lg bg-card object-contain" />
          ) : undefined
        }
        status={<StatusItems items={[company.fundingStage, company.sector, company.geography, founderNote]} />}
        action={
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => router.push(`/admin/companies/${companyId}/updates/new`)}>
              <Plus className="h-4 w-4" />
              Create update
            </Button>
            <DetailMenu>
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                Edit details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} disabled={deleting} className="text-destructive">
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
                {deleting ? "Deleting..." : "Delete company"}
              </DropdownMenuItem>
            </DetailMenu>
          </div>
        }
        condensedAction={
          <Button variant="primary" onClick={() => router.push(`/admin/companies/${companyId}/updates/new`)}>
            <Plus className="h-4 w-4" />
            Create update
          </Button>
        }
      />

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
