"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Landmark, Plus, X, FileText, Handshake, Layers, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncPanel } from "@/components/admin/sync-panel";
import { formatDate } from "@/lib/utils";

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
    <AppShell>
      <PageHeader
        title="Funds"
        description="DFS Lab's investment vehicles — deals, LPs, and fund reports."
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
        <div className="mb-6 flex gap-1 overflow-x-auto border-b">
          <button
            onClick={() => selectTab("funds")}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
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
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "sync"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Sync
          </button>
        </div>
      )}

      {activeTab === "sync" ? (
        <SyncPanel />
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : funds.length === 0 ? (
        <EmptyState icon={<Landmark className="h-8 w-8" />} title="No funds yet" description="Create a fund to start recording deals." />
      ) : (
        <div className="space-y-3">
          {funds.map((f) => (
            <Link
              key={f.id}
              href={`/admin/funds/${f.id}`}
              className="block rounded-md border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
                  <Landmark className="h-4 w-4" />
                </div>
                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{f.name}</span>
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">{f.slug}</span>
                    {f.groupLabel && <span className="text-xs text-muted-foreground">{f.groupLabel}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {f.aumUsd !== null && <span>AUM ${f.aumUsd.toLocaleString()}</span>}
                    {f.firstDealDate && <span>First deal {formatDate(f.firstDealDate)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> {f.dealCount} deal{f.dealCount !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Handshake className="h-3.5 w-3.5" /> {f.lpCount} LP{f.lpCount !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> {f.reportCount} report{f.reportCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <Modal title="New Fund" onClose={() => setShowNew(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label mb-1.5 block">Slug *</label>
              <Input
                autoFocus
                required
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="e.g. FUND1"
              />
              <p className="mt-1 text-xs text-muted-foreground">Internal import key — never shown to LPs.</p>
            </div>
            <div>
              <label className="label mb-1.5 block">Display name *</label>
              <Input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. DFS Lab SPV I" />
            </div>
            {saveError && <p className="text-sm text-laterite">{saveError}</p>}
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
