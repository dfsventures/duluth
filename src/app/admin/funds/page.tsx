"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Landmark, Plus, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncPanel } from "@/components/admin/sync-panel";
import { FundMetricsSyncPanel } from "@/components/admin/fund-metrics-sync-panel";
import { formatDate } from "@/lib/utils";
import { ORG_NAME } from "@/lib/org";
import { ModalDialog as Modal } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

type FundsTab = "funds" | "sync";

interface Fund {
  id: string;
  slug: string;
  name: string;
  groupLabel: string | null;
  aumUsd: number | null;
  firstDealDate: string | null;
  dealCount: number;
  lpCount: number;
  reportCount: number;
}

// WS169: one-line rows in the shared table.
const fundColumns: DataTableColumn<Fund>[] = [
  {
    key: "name",
    header: "Name",
    sortValue: (f) => f.name,
    title: (f) => `${f.name} (${f.slug})`,
    cell: (f) => (
      <>
        {f.name}
        <span className="ml-2 text-muted-foreground">{f.slug}</span>
      </>
    ),
  },
  {
    key: "group",
    header: "Group",
    sortValue: (f) => f.groupLabel,
    mobile: "meta",
    cell: (f) => f.groupLabel ?? "—",
  },
  { key: "deals", header: "Deals", align: "num", sortValue: (f) => f.dealCount, firstDir: "desc", mobile: "meta", cell: (f) => f.dealCount },
  { key: "lps", header: "LPs", align: "num", sortValue: (f) => f.lpCount, firstDir: "desc", mobile: "meta", cell: (f) => f.lpCount },
  {
    key: "aum",
    header: "AUM",
    align: "num",
    sortValue: (f) => f.aumUsd,
    firstDir: "desc",
    cell: (f) => (f.aumUsd === null ? "—" : `$${f.aumUsd.toLocaleString()}`),
  },
  {
    key: "firstDeal",
    header: "First deal",
    sortValue: (f) => (f.firstDealDate ? new Date(f.firstDealDate).getTime() : null),
    firstDir: "desc",
    className: "whitespace-nowrap text-muted-foreground",
    cell: (f) => (f.firstDealDate ? formatDate(f.firstDealDate) : "—"),
  },
];

export default function AdminFundsPage() {
  return (
    <Suspense fallback={null}>
      <AdminFundsPageInner />
    </Suspense>
  );
}

function AdminFundsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") === "sync" ? "sync" : "funds";

  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Part 11, WS28 (Q30-B) — Sync used to be its own sidebar item/page; it's
  // a global integration (one spreadsheet, every fund), so it's now a tab
  // here rather than duplicated per-fund. Mirrors the same lightweight
  // enabled-check the sidebar used to gate its old nav item, so a fork with
  // no Sheets env vars never sees the tab at all.
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<FundsTab>(requestedTab);

  useEffect(() => {
    fetch("/api/admin/sheets-sync")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled?: boolean } | null) => setSyncEnabled(Boolean(data?.enabled)))
      .catch(() => setSyncEnabled(false));
  }, []);

  // If ?tab=sync was requested but sync turns out to be disabled, fall
  // back to the Funds tab rather than showing a tab button that isn't there.
  useEffect(() => {
    if (requestedTab === "sync" && !syncEnabled) {
      setActiveTab("funds");
    }
  }, [requestedTab, syncEnabled]);

  function selectTab(tab: FundsTab) {
    setActiveTab(tab);
    router.replace(tab === "sync" ? "/admin/funds?tab=sync" : "/admin/funds");
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/funds");
      if (res.ok) setFunds(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNew() {
    setNewSlug("");
    setNewName("");
    setSaveError("");
    setShowNew(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/admin/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug, name: newName }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to create fund");
      }
      setShowNew(false);
      loadData();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell width="wide">
      <PageHeader
        title="Funds"
        description={`${ORG_NAME}'s investment vehicles — deals, LPs, and fund reports.`}
        action={
          activeTab === "funds" ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              New Fund
            </Button>
          ) : undefined
        }
      />

      {syncEnabled && (
        <div data-align="tabs" className="page-tabs mb-6 flex gap-1 overflow-x-auto border-b">
          <button
            onClick={() => selectTab("funds")}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 v2:px-0 text-sm font-medium transition-colors ${
              activeTab === "funds"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
            }`}
          >
            <Landmark className="h-4 w-4" />
            Funds
          </button>
          <button
            onClick={() => selectTab("sync")}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 v2:px-0 text-sm font-medium transition-colors ${
              activeTab === "sync"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
            }`}
          >
            <RefreshCw className="h-4 w-4 v2:hidden" />
            Sync
          </button>
        </div>
      )}

      {activeTab === "sync" ? (
        <div className="space-y-8 v2:pt-2">
          <SyncPanel />
          {/* Part 36, WS103.3 — a sibling sub-section, not a new tab/sidebar
              item (Part 11/WS28 consolidated sync onto this one tab). */}
          <div className="border-t border-border pt-8">
            <FundMetricsSyncPanel />
          </div>
        </div>
      ) : (
        <DataTable<Fund>
          label="Funds"
          noun="fund"
          rows={funds}
          rowKey={(f) => f.id}
          columns={fundColumns}
          rowHref={(f) => `/admin/funds/${f.id}`}
          defaultSort={{ key: "name", dir: "asc" }}
          searchText={(f) => [f.name, f.slug, f.groupLabel]}
          searchPlaceholder="Filter funds"
          loading={loading}
          minWidth={720}
          empty={<EmptyState eyebrow="Funds" icon={<Landmark className="h-8 w-8" />} title="No funds yet" description="Create a fund to start recording deals." />}
        />
      )}

      {showNew && (
        <Modal title="New Fund" onClose={() => setShowNew(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="new-fund-slug" className="label mb-1.5 block">Slug *</label>
              <Input
                id="new-fund-slug"
                autoFocus
                required
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="e.g. FUND1"
              />
              <p className="mt-1 text-xs text-muted-foreground">Internal import key — never shown to LPs.</p>
            </div>
            <div>
              <label htmlFor="new-fund-name" className="label mb-1.5 block">Display name *</label>
              <Input id="new-fund-name" required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`e.g. ${ORG_NAME} SPV I`} />
            </div>
            {saveError && <p className="text-sm text-tone-clay-ink">{saveError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Fund"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
