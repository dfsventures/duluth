"use client";

import type { ReactNode } from "react";
import { Pencil, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/layout/page-header";
import { DetailMenu } from "@/components/layout/page-header-menu";
import { TabBar, type TabDef } from "@/components/ui/tab-bar";
import { formatDate } from "@/lib/utils";

export type FundTab = "deals" | "lps" | "reports" | "cashflows";

interface Props {
  fund: {
    name: string;
    slug: string;
    groupLabel: string | null;
    aumUsd: number | null;
    firstDealDate: string | null;
  };
  /** True while the details form is open in the panel. */
  editingDetails: boolean;
  /** The details form (name, group label, AUM), shown in the panel while editing. */
  detailsForm: ReactNode;
  onEditDetails: () => void;
  onAddDeal: () => void;
  /** True while the performance-metrics form is open. */
  editingPerformance: boolean;
  onEditPerformance: () => void;
  /** The Performance card (its numbers, labels and order are unchanged). */
  performance: ReactNode;
  /** The performance-metrics form, shown under the card while editing. */
  performanceForm: ReactNode;
  tabs: TabDef<FundTab>[];
  activeTab: FundTab;
  /** The active tab's content. */
  children: ReactNode;
}

/**
 * The fund page in the new look (B-133), laid out like the company and update pages: header bar (back,
 * the one primary, ⋯), then a main column and a sticky 296px panel of the fund's properties. Unlike
 * those pages the main column is up to 960px, not 720, because the Deals table has eleven columns and
 * needs about 900px; the group stays centred. Geometry lives in globals.css under `.fund-dossier`.
 * Under 1344px (the group plus gutters) the panel sits under the title and the main column fills the width.
 */
export function FundRecord({
  fund,
  editingDetails,
  detailsForm,
  onEditDetails,
  onAddDeal,
  editingPerformance,
  onEditPerformance,
  performance,
  performanceForm,
  tabs,
  activeTab,
  children,
}: Props) {
  const rows: { label: string; value: ReactNode }[] = [{ label: "Code", value: <span className="font-mono text-meta">{fund.slug}</span> }];
  if (fund.groupLabel) rows.push({ label: "Group", value: fund.groupLabel });
  if (fund.aumUsd !== null) rows.push({ label: "AUM", value: `$${fund.aumUsd.toLocaleString()}` });
  if (fund.firstDealDate) rows.push({ label: "First deal", value: formatDate(fund.firstDealDate) });

  const addDeal = (
    <Button variant="primary" onClick={onAddDeal}>
      <Plus className="h-4 w-4" />
      Add deal
    </Button>
  );

  return (
    // The page is AppShell width="detail-wide": the shared page frame gives the padding and the width.
    <div className="fund-dossier">
      {/* Page types v1, Detail: back above the title, the actions on the title row. */}
      <PageHeader
        type="detail"
        back={{ href: "/admin/funds", label: "Funds" }}
        title={fund.name}
        condensedAction={addDeal}
        action={
          <div className="flex items-center gap-2">
            {addDeal}
            <DetailMenu>
              <DropdownMenuItem onSelect={onEditDetails}>
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEditPerformance} disabled={editingPerformance}>
                <TrendingUp aria-hidden className="h-3.5 w-3.5" />
                Edit performance metrics
              </DropdownMenuItem>
            </DetailMenu>
          </div>
        }
      />

      <div className="fund-dossier-grid">
        <aside aria-label="Fund details" className="fund-aside">
          <div className="rounded-lg bg-muted/60 p-4 v2:bg-card">
            {editingDetails ? (
              detailsForm
            ) : (
              <dl className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-row">
                {rows.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="pt-0.5 text-meta text-muted-foreground">{r.label}</dt>
                    <dd className="min-w-0 break-words text-row text-foreground">{r.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </aside>

        <div className="fund-main min-w-0">
          {performance}
          {editingPerformance && performanceForm}
        </div>

        <div className="fund-tail min-w-0">
          <TabBar<FundTab> label="Fund sections" tabs={tabs} active={activeTab} fallback="deals" />
          {children}
        </div>
      </div>
    </div>
  );
}
