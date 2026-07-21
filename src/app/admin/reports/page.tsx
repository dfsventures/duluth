"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Plus, X, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface FundOption {
  id: string;
  name: string;
  slug: string;
}

interface Report {
  id: string;
  title: string;
  periodLabel: string | null;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  createdAt: string;
  fund: FundOption;
  mentionCount: number;
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={null}>
      <AdminReportsPageInner />
    </Suspense>
  );
}

function AdminReportsPageInner() {
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [fundFilter, setFundFilter] = useState(searchParams.get("fundId") ?? "");
  const [loading, setLoading] = useState(true);

  const [showNew, setShowNew] = useState(false);
  const [newFundId, setNewFundId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPeriodLabel, setNewPeriodLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteDraft(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this draft report? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, { method: "DELETE" });
      if (res.ok) setReports((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fundFilter) params.set("fundId", fundFilter);
      const [reportsRes, fundsRes] = await Promise.all([
        fetch(`/api/admin/reports?${params}`),
        fetch("/api/admin/funds"),
      ]);
      if (reportsRes.ok) setReports(await reportsRes.json());
      if (fundsRes.ok) setFunds(await fundsRes.json());
    } finally {
      setLoading(false);
    }
  }, [fundFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNew() {
    setNewFundId(fundFilter || funds[0]?.id || "");
    setNewTitle("");
    setNewPeriodLabel("");
    setSaveError("");
    setShowNew(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId: newFundId, title: newTitle, periodLabel: newPeriodLabel || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to create report");
      }
      const report = await res.json();
      window.location.href = `/admin/reports/${report.id}`;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Fund Reports"
        description="Letter-style reports authored for LPs, with company mentions and valuation snapshots."
        action={
          <Button onClick={openNew} disabled={funds.length === 0}>
            <Plus className="h-4 w-4" />
            New Report
          </Button>
        }
      />

      <div className="mb-6">
        <Select
          value={fundFilter}
          onChange={(e) => setFundFilter(e.target.value)}
          className="max-w-xs"
        >
          <option value="">All funds</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="No reports yet" description="Create the first fund report." />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/admin/reports/${r.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
            >
              <div className="min-w-48 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">{r.title}</span>
                  <Badge variant={r.status === "PUBLISHED" ? "success" : "warning"}>
                    {r.status === "PUBLISHED" ? "Published" : "Draft"}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{r.fund.name}</span>
                  {r.periodLabel && <span>{r.periodLabel}</span>}
                  <span>{r.mentionCount} mention{r.mentionCount !== 1 ? "s" : ""}</span>
                  {r.publishedAt && <span>Published {formatDate(r.publishedAt)}</span>}
                </div>
              </div>
              {r.status === "DRAFT" && (
                <button
                  onClick={(e) => handleDeleteDraft(e, r.id)}
                  disabled={deletingId === r.id}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                  title="Delete draft"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <Modal title="New Report" onClose={() => setShowNew(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Select
              id="newReportFund"
              label="Fund *"
              required
              value={newFundId}
              onChange={(e) => setNewFundId(e.target.value)}
            >
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <Input label="Title *" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. FUND1 — H1 2026 Report" />
            <Input label="Period label" value={newPeriodLabel} onChange={(e) => setNewPeriodLabel(e.target.value)} placeholder="e.g. H1 2026" />
            {saveError && <p className="text-sm text-laterite">{saveError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Report"}
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
