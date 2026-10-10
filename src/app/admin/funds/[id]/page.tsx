"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Layers,
  Handshake,
  FileText,
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  DollarSign,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { FundPerformanceCard } from "@/components/fund-performance-card";
import { positionValue } from "@/lib/portfolio-metrics";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useFlashMessage } from "@/lib/use-flash-message";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { TabBar } from "@/components/ui/tab-bar";
import { parseTab } from "@/lib/url-tab";

type Tab = "deals" | "lps" | "reports" | "cashflows";

interface Deal {
  id: string;
  portfolioCompanyId: string;
  portfolioCompanyName: string;
  investmentType: "INITIAL" | "FOLLOW_ON";
  dealDate: string;
  country: string | null;
  amountUsd: number;
  instrument: string | null;
  entryValuation: number | null;
  currentValuation: number | null;
  ownershipPct: number | null;
  valuationAsOf: string | null;
  notes: string | null;
  sheetRowId: string | null;
}

interface Cashflow {
  id: string;
  kind: "CAPITAL_CALL" | "DISTRIBUTION" | "FEE" | "OTHER";
  date: string;
  amountUsd: number;
  portfolioCompanyId: string | null;
  portfolioCompanyName: string | null;
  notes: string | null;
}

interface Performance {
  invested: number;
  impliedValue: number;
  dilutionAware: boolean;
  paidIn: number;
  approximate: boolean;
  tvpi: number | null;
  dpi: number | null;
  grossIrr: number | null;
  asOf: string;
}

interface FundDetail {
  id: string;
  slug: string;
  name: string;
  groupLabel: string | null;
  firstDealDate: string | null;
  aumUsd: number | null;
  // Part 15, WS37.4 — manual performance override fields (Q46-Q52).
  grossMoicOverride: number | null;
  netTvpiOverride: number | null;
  netDpiOverride: number | null;
  // Part 36, WS101.1 — two more reported figures + four visibility flags
  // (D4/D5). netIrrOverride is a FRACTION (0.0205 = 2.05%, Q89 = A).
  netIrrOverride: number | null;
  netNavOverride: number | null;
  showGrossMoic: boolean;
  showNetTvpi: boolean;
  showNetIrr: boolean;
  showNetNav: boolean;
  deals: Deal[];
  lps: { id: string; lp: { id: string; email: string; name: string | null } }[];
  reports: { id: string; title: string; periodLabel: string | null; status: string; publishedAt: string | null; createdAt: string }[];
  cashflows: Cashflow[];
  performance: Performance;
  sheetsSyncEnabled: boolean;
}

const CASHFLOW_KINDS = ["CAPITAL_CALL", "DISTRIBUTION", "FEE", "OTHER"] as const;
const CASHFLOW_LABELS: Record<string, string> = {
  CAPITAL_CALL: "Capital Call",
  DISTRIBUTION: "Distribution",
  FEE: "Fee",
  OTHER: "Other",
};

interface PortfolioCompanyOption {
  id: string;
  name: string;
}

interface LpOption {
  id: string;
  email: string;
  name: string | null;
}

// F103 follow-up — this used to be a bare current/entry ratio, a third
// independent implementation alongside computeMultiple()/positionValue() in
// portfolio-metrics.ts. Routed through the same positionValue() the fund
// total and the report snapshot use, so all three surfaces agree once a
// deal's ownershipPct is known. Byte-identical to the old label for the
// (still-common) case where ownershipPct is null.
function multipleLabel(d: { amountUsd: number; entryValuation: number | null; currentValuation: number | null; ownershipPct: number | null }): string {
  const pv = positionValue({ amountUsd: d.amountUsd, entryValuation: d.entryValuation, currentValuation: d.currentValuation, ownershipPct: d.ownershipPct }, d.currentValuation);
  if (pv.value === null || d.amountUsd <= 0) return "n/a";
  if (pv.value === 0) return "Written off";
  return `${(pv.value / d.amountUsd).toFixed(1)}×`;
}

function multipleNumber(d: { amountUsd: number; entryValuation: number | null; currentValuation: number | null; ownershipPct: number | null }): number | null {
  const pv = positionValue({ amountUsd: d.amountUsd, entryValuation: d.entryValuation, currentValuation: d.currentValuation, ownershipPct: d.ownershipPct }, d.currentValuation);
  if (pv.value === null || d.amountUsd <= 0) return null;
  return pv.value / d.amountUsd;
}

const FUND_TABS: readonly Tab[] = ["deals", "lps", "reports", "cashflows"];

export default function AdminFundDetailPage() {
  // useSearchParams (for the URL tab) needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AdminFundDetailPageInner />
    </Suspense>
  );
}

function AdminFundDetailPageInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fundId = params.id as string;

  const [fund, setFund] = useState<FundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const activeTab = parseTab(searchParams.get("tab"), FUND_TABS, "deals");
  const [, setMessage] = useFlashMessage();

  const [portfolioCompanies, setPortfolioCompanies] = useState<PortfolioCompanyOption[]>([]);
  const [allLps, setAllLps] = useState<LpOption[]>([]);

  // Header edit
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerName, setHeaderName] = useState("");
  const [headerGroupLabel, setHeaderGroupLabel] = useState("");
  const [headerAum, setHeaderAum] = useState("");
  const [savingHeader, setSavingHeader] = useState(false);

  // Performance override edit (Part 15, WS37.4; widened Part 36, WS101.2)
  const [editingOverrides, setEditingOverrides] = useState(false);
  const [overrideGrossMoic, setOverrideGrossMoic] = useState("");
  const [overrideNetTvpi, setOverrideNetTvpi] = useState("");
  const [overrideNetDpi, setOverrideNetDpi] = useState("");
  const [overrideNetIrr, setOverrideNetIrr] = useState("");
  const [overrideNetNav, setOverrideNetNav] = useState("");
  const [showGrossMoic, setShowGrossMoic] = useState(true);
  const [showNetTvpi, setShowNetTvpi] = useState(true);
  const [showNetIrr, setShowNetIrr] = useState(true);
  const [showNetNav, setShowNetNav] = useState(true);
  const [savingOverrides, setSavingOverrides] = useState(false);

  // Add deal modal
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [dealForm, setDealForm] = useState({
    portfolioCompanyId: "",
    newCompanyName: "",
    investmentType: "INITIAL" as "INITIAL" | "FOLLOW_ON",
    dealDate: "",
    country: "",
    amountUsd: "",
    instrument: "",
    entryValuation: "",
    currentValuation: "",
    notes: "",
  });
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealError, setDealError] = useState("");

  // Edit deal (inline valuation edit)
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [editDealValuation, setEditDealValuation] = useState("");

  // Assign LP
  const [assignLpId, setAssignLpId] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Cashflows (WS25.4)
  const [cashflowForm, setCashflowForm] = useState({ kind: "CAPITAL_CALL" as Cashflow["kind"], date: "", amountUsd: "", portfolioCompanyId: "", notes: "" });
  const [savingCashflow, setSavingCashflow] = useState(false);
  const [cashflowError, setCashflowError] = useState("");

  const loadFund = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/funds/${fundId}`);
      if (res.ok) {
        const data = await res.json();
        setFund(data);
        setHeaderName(data.name);
        setHeaderGroupLabel(data.groupLabel ?? "");
        setHeaderAum(data.aumUsd !== null ? String(data.aumUsd) : "");
      }
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    loadFund();
  }, [loadFund]);

  useEffect(() => {
    fetch("/api/admin/portfolio-companies")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPortfolioCompanies)
      .catch(() => {});
    fetch("/api/admin/lps")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAllLps)
      .catch(() => {});
  }, []);

  async function handleSaveHeader() {
    setSavingHeader(true);
    try {
      const res = await fetch(`/api/admin/funds/${fundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: headerName.trim(),
          groupLabel: headerGroupLabel.trim() || null,
          aumUsd: headerAum.trim() === "" ? null : Number(headerAum),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save");
      }
      setEditingHeader(false);
      loadFund();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save fund." });
    } finally {
      setSavingHeader(false);
    }
  }

  // Part 15, WS37.4 — performance override edit/save (Q46-Q52); widened
  // Part 36, WS101.3/WS101.4 (D4/D5).
  function openEditOverrides() {
    if (!fund) return;
    setOverrideGrossMoic(fund.grossMoicOverride !== null ? String(fund.grossMoicOverride) : "");
    setOverrideNetTvpi(fund.netTvpiOverride !== null ? String(fund.netTvpiOverride) : "");
    setOverrideNetDpi(fund.netDpiOverride !== null ? String(fund.netDpiOverride) : "");
    setOverrideNetIrr(fund.netIrrOverride !== null ? String(fund.netIrrOverride) : "");
    setOverrideNetNav(fund.netNavOverride !== null ? String(fund.netNavOverride) : "");
    setShowGrossMoic(fund.showGrossMoic);
    setShowNetTvpi(fund.showNetTvpi);
    setShowNetIrr(fund.showNetIrr);
    setShowNetNav(fund.showNetNav);
    setEditingOverrides(true);
  }

  async function handleSaveOverrides() {
    setSavingOverrides(true);
    try {
      const res = await fetch(`/api/admin/funds/${fundId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grossMoicOverride: overrideGrossMoic.trim() === "" ? null : Number(overrideGrossMoic),
          netTvpiOverride: overrideNetTvpi.trim() === "" ? null : Number(overrideNetTvpi),
          netDpiOverride: overrideNetDpi.trim() === "" ? null : Number(overrideNetDpi),
          // Part 36, WS101.4 — no conversion at this boundary (Q89). The
          // value typed is the value PATCHed is the value stored.
          netIrrOverride: overrideNetIrr.trim() === "" ? null : Number(overrideNetIrr),
          netNavOverride: overrideNetNav.trim() === "" ? null : Number(overrideNetNav),
          showGrossMoic,
          showNetTvpi,
          showNetIrr,
          showNetNav,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save");
      }
      setEditingOverrides(false);
      setMessage({ type: "success", text: "Performance override saved." });
      loadFund();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setSavingOverrides(false);
    }
  }

  function openAddDeal() {
    setDealForm({
      portfolioCompanyId: "",
      newCompanyName: "",
      investmentType: "INITIAL",
      dealDate: "",
      country: "",
      amountUsd: "",
      instrument: "",
      entryValuation: "",
      currentValuation: "",
      notes: "",
    });
    setDealError("");
    setShowAddDeal(true);
  }

  async function handleAddDeal(e: React.FormEvent) {
    e.preventDefault();
    setSavingDeal(true);
    setDealError("");
    try {
      let portfolioCompanyId = dealForm.portfolioCompanyId;
      if (portfolioCompanyId === "__new__") {
        const name = dealForm.newCompanyName.trim();
        if (!name) throw new Error("New company name is required.");
        const res = await fetch("/api/admin/portfolio-companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, country: dealForm.country.trim() || null }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error ?? "Failed to create portfolio company");
        }
        const created = await res.json();
        portfolioCompanyId = created.id;
        setPortfolioCompanies((prev) => [...prev, { id: created.id, name: created.name }]);
      }
      if (!portfolioCompanyId) throw new Error("Select or create a portfolio company.");

      const res = await fetch("/api/admin/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundId,
          portfolioCompanyId,
          investmentType: dealForm.investmentType,
          dealDate: dealForm.dealDate,
          country: dealForm.country.trim() || null,
          amountUsd: dealForm.amountUsd,
          instrument: dealForm.instrument.trim() || null,
          entryValuation: dealForm.entryValuation || null,
          currentValuation: dealForm.currentValuation || null,
          notes: dealForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to add deal");
      }
      setShowAddDeal(false);
      loadFund();
    } catch (err) {
      setDealError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingDeal(false);
    }
  }

  const confirm = useConfirm();
  async function handleDeleteDeal(dealId: string) {
    if (!(await confirm({ title: "Delete this deal", description: "This cannot be undone.", confirmLabel: "Delete deal" }))) return;
    await fetch(`/api/admin/deals/${dealId}`, { method: "DELETE" });
    loadFund();
  }

  function startEditValuation(deal: Deal) {
    setEditingDealId(deal.id);
    setEditDealValuation(deal.currentValuation !== null ? String(deal.currentValuation) : "");
  }

  async function saveEditValuation(dealId: string) {
    try {
      const res = await fetch(`/api/admin/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentValuation: editDealValuation === "" ? null : Number(editDealValuation) }),
      });
      if (!res.ok) throw new Error("Failed to update valuation");
      setEditingDealId(null);
      loadFund();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update valuation." });
    }
  }

  async function handleAssignLp() {
    if (!assignLpId) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/lps/${assignLpId}/funds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId }),
      });
      if (!res.ok) throw new Error("Failed to assign LP");
      setAssignLpId("");
      loadFund();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to assign LP." });
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassignLp(lpId: string) {
    await fetch(`/api/admin/lps/${lpId}/funds`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundId }),
    });
    loadFund();
  }

  async function handleAddCashflow(e: React.FormEvent) {
    e.preventDefault();
    setSavingCashflow(true);
    setCashflowError("");
    try {
      const res = await fetch(`/api/admin/funds/${fundId}/cashflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: cashflowForm.kind,
          date: cashflowForm.date,
          amountUsd: cashflowForm.amountUsd,
          portfolioCompanyId: cashflowForm.portfolioCompanyId || null,
          notes: cashflowForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to add cashflow");
      }
      setCashflowForm({ kind: "CAPITAL_CALL", date: "", amountUsd: "", portfolioCompanyId: "", notes: "" });
      loadFund();
    } catch (err) {
      setCashflowError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingCashflow(false);
    }
  }

  async function handleDeleteCashflow(id: string) {
    if (!(await confirm({ title: "Delete this cashflow record", description: "This cannot be undone.", confirmLabel: "Delete cashflow" }))) return;
    await fetch(`/api/admin/cashflows/${id}`, { method: "DELETE" });
    loadFund();
  }

  if (loading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!fund) {
    return (
      <AppShell>
        <PageHeader title="Fund not found" />
        <Button variant="secondary" onClick={() => router.push("/admin/funds")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Funds
        </Button>
      </AppShell>
    );
  }

  const unassignedLps = allLps.filter((lp) => !fund.lps.some((m) => m.lp.id === lp.id));

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "deals", label: "Deals", count: fund.deals.length, icon: <Layers aria-hidden="true" className="h-4 w-4" /> },
    { key: "lps", label: "LPs", count: fund.lps.length, icon: <Handshake aria-hidden="true" className="h-4 w-4" /> },
    { key: "reports", label: "Reports", count: fund.reports.length, icon: <FileText aria-hidden="true" className="h-4 w-4" /> },
    { key: "cashflows", label: "Cashflows", count: fund.cashflows.length, icon: <DollarSign aria-hidden="true" className="h-4 w-4" /> },
  ];

  // Part 10, WS27.5: both conditions, mirroring the API's own enforcement. A fork
  // with sync disabled, or a manually-created deal (no sheetRowId), is unaffected.
  const isSyncedDeal = (d: Deal) => Boolean(fund?.sheetsSyncEnabled) && Boolean(d.sheetRowId);

  const dealColumns: DataTableColumn<Deal>[] = [
    { key: "company", header: "Company", sortValue: (d) => d.portfolioCompanyName, cell: (d) => d.portfolioCompanyName },
    {
      key: "type",
      header: "Type",
      cell: (d) => (
        <span className={d.investmentType === "INITIAL" ? "badge-info" : "badge-neutral"}>
          {d.investmentType === "INITIAL" ? "Initial" : "Follow-on"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortValue: (d) => new Date(d.dealDate).getTime(),
      firstDir: "desc",
      className: "whitespace-nowrap",
      mobile: "meta",
      cell: (d) => formatDate(d.dealDate),
    },
    {
      key: "amount",
      header: "Amount",
      align: "num",
      sortValue: (d) => d.amountUsd,
      firstDir: "desc",
      mobile: "badge",
      cell: (d) => `$${d.amountUsd.toLocaleString()}`,
    },
    { key: "instrument", header: "Instrument", mobile: "meta", cell: (d) => d.instrument ?? "—" },
    {
      key: "entry",
      header: "Entry val.",
      align: "num",
      sortValue: (d) => d.entryValuation,
      firstDir: "desc",
      cell: (d) => (d.entryValuation !== null ? `$${d.entryValuation.toLocaleString()}` : "—"),
    },
    {
      key: "current",
      header: "Current val.",
      align: "num",
      sortValue: (d) => d.currentValuation,
      firstDir: "desc",
      cell: (d) =>
        isSyncedDeal(d) ? (
          <span>{d.currentValuation !== null ? `$${d.currentValuation.toLocaleString()}` : "—"}</span>
        ) : editingDealId === d.id ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              autoFocus
              aria-label={`Current valuation for ${d.portfolioCompanyName}`}
              value={editDealValuation}
              onChange={(e) => setEditDealValuation(e.target.value)}
              className="w-28 rounded-sm border border-input bg-card px-2 py-1 text-sm"
            />
            <button onClick={() => saveEditValuation(d.id)} className="rounded p-1 text-acacia hover:bg-muted" title="Save" aria-label="Save valuation">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditingDealId(null)} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Cancel" aria-label="Cancel editing">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button className="hover:underline" onClick={() => startEditValuation(d)} title="Edit valuation">
            {d.currentValuation !== null ? `$${d.currentValuation.toLocaleString()}` : "—"}
          </button>
        ),
    },
    {
      key: "multiple",
      header: "Multiple",
      align: "num",
      sortValue: (d) => multipleNumber(d),
      firstDir: "desc",
      cell: (d) => multipleLabel(d),
    },
    {
      key: "asOf",
      header: "As of",
      sortValue: (d) => (d.valuationAsOf ? new Date(d.valuationAsOf).getTime() : null),
      firstDir: "desc",
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (d) => (d.valuationAsOf ? formatDate(d.valuationAsOf) : "—"),
    },
    {
      key: "source",
      header: "Source",
      cell: (d) =>
        isSyncedDeal(d) ? (
          <span className="badge-neutral" title="Sheet-owned fields are read-only while sync is enabled">
            Synced from sheet
          </span>
        ) : null,
    },
  ];

  const cashflowColumns: DataTableColumn<Cashflow>[] = [
    {
      key: "kind",
      header: "Kind",
      sortValue: (c) => CASHFLOW_LABELS[c.kind],
      cell: (c) => (
        <Badge variant={c.kind === "DISTRIBUTION" ? "success" : c.kind === "CAPITAL_CALL" ? "info" : "neutral"}>
          {CASHFLOW_LABELS[c.kind]}
        </Badge>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortValue: (c) => new Date(c.date).getTime(),
      firstDir: "desc",
      className: "whitespace-nowrap",
      mobile: "meta",
      cell: (c) => formatDate(c.date),
    },
    {
      key: "amount",
      header: "Amount",
      align: "num",
      sortValue: (c) => c.amountUsd,
      firstDir: "desc",
      mobile: "badge",
      cell: (c) => `$${c.amountUsd.toLocaleString()}`,
    },
    {
      key: "company",
      header: "Company",
      sortValue: (c) => c.portfolioCompanyName,
      mobile: "meta",
      cell: (c) => c.portfolioCompanyName ?? <span className="text-muted-foreground">—</span>,
    },
    { key: "notes", header: "Notes", mobile: "meta", cell: (c) => c.notes ?? <span className="text-muted-foreground">—</span> },
  ];

  return (
    <AppShell>
      <Breadcrumb items={[{ label: "Funds", href: "/admin/funds" }, { label: fund.name }]} />


      <div className="mb-6 rounded-md border border-border bg-card p-4">
        {editingHeader ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name" value={headerName} onChange={(e) => setHeaderName(e.target.value)} />
              <Input label="Group label" value={headerGroupLabel} onChange={(e) => setHeaderGroupLabel(e.target.value)} />
            </div>
            <Input label="AUM (USD)" type="number" value={headerAum} onChange={(e) => setHeaderAum(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditingHeader(false)} disabled={savingHeader}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveHeader} disabled={savingHeader}>
                {savingHeader ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground">{fund.name}</h1>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">{fund.slug}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                {fund.groupLabel && <span>{fund.groupLabel}</span>}
                {fund.aumUsd !== null && <span>AUM ${fund.aumUsd.toLocaleString()}</span>}
                {fund.firstDealDate && <span>First deal {formatDate(fund.firstDealDate)}</span>}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditingHeader(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        )}
      </div>

      {/* Performance (WS26, admin-only estimate — Q23). Part 14, WS36.1:
          extracted into FundPerformanceCard — byte-identical output, no
          `deals` prop here so this page's own Deals tab below (with the
          sheet-sync column and sortable headers) is unaffected. */}
      <FundPerformanceCard
        performance={fund.performance}
        overrides={{
          grossMoic: fund.grossMoicOverride,
          netTvpi: fund.netTvpiOverride,
          netDpi: fund.netDpiOverride,
          netIrr: fund.netIrrOverride,
          netNav: fund.netNavOverride,
          showGrossMoic: fund.showGrossMoic,
          showNetTvpi: fund.showNetTvpi,
          showNetIrr: fund.showNetIrr,
          showNetNav: fund.showNetNav,
        }}
      />

      {/* Part 15, WS37.4 — manual performance override edit affordance. Lives
          only here, in the admin-only fund detail page — never inside
          FundPerformanceCard/FundSnapshotBlock themselves, since that same
          component tree is portalled into the read-only LP page (ground
          rule 3). Widened Part 36, WS101.5/101.6 — five numbers, four
          visibility checkboxes. This ships even though D1 automates the
          values: the flags are admin-owned and the sync never writes them
          (JC-FM-D), and this form is the fallback when the sync is down. */}
      {editingOverrides ? (
        <div className="mb-6 rounded-md border border-border bg-card p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Manual override — when any of these five are set, they replace the TVPI/DPI/Gross IRR slots above for
            this fund. Clear a value to go back to Molly&apos;s own computed number for that slot. Unticking a
            visibility box below hides that metric for this fund everywhere its Performance card renders —
            including in LP reports published from now on. Reports already published keep whatever was frozen
            into them at publish time.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Input label="Gross MOIC" type="number" step="0.01" value={overrideGrossMoic} onChange={(e) => setOverrideGrossMoic(e.target.value)} />
            <Input label="Net TVPI" type="number" step="0.01" value={overrideNetTvpi} onChange={(e) => setOverrideNetTvpi(e.target.value)} />
            <Input label="Net DPI" type="number" step="0.01" value={overrideNetDpi} onChange={(e) => setOverrideNetDpi(e.target.value)} />
            {/* Part 36, WS101.5 (Q89 = A, LOCKED) — fraction storage, NOT a
                "%" field. The label is the guardrail: an admin typing "2.05"
                here stores 205%, and nothing checks bounds (matching aumUsd,
                Part 15/JC-C). Do not shorten this label or convert at this
                boundary — the only division by 100 lives in the sync parser. */}
            <Input
              label="Net IRR (decimal, e.g. 0.0205 = 2.05%)"
              type="number"
              step="0.0001"
              value={overrideNetIrr}
              onChange={(e) => setOverrideNetIrr(e.target.value)}
            />
            <Input label="Net NAV (USD)" type="number" step="1" value={overrideNetNav} onChange={(e) => setOverrideNetNav(e.target.value)} />
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Show on this fund&apos;s Performance card (admin, report preview, and published LP reports).
              Net DPI is always shown when a value is set.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(
                [
                  ["Gross MOIC", showGrossMoic, setShowGrossMoic],
                  ["Net TVPI", showNetTvpi, setShowNetTvpi],
                  ["Net IRR", showNetIrr, setShowNetIrr],
                  ["Net NAV", showNetNav, setShowNetNav],
                ] as const
              ).map(([label, checked, set]) => (
                <label key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => set(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={handleSaveOverrides} disabled={savingOverrides}>
              {savingOverrides ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditingOverrides(false)} disabled={savingOverrides}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="mb-6" onClick={openEditOverrides}>
          Edit performance metrics
        </Button>
      )}

      <TabBar<Tab> label="Fund sections" tabs={tabs} active={activeTab} fallback="deals" />

      {activeTab === "deals" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Deals</h3>
            <Button size="sm" onClick={openAddDeal}>
              <Plus className="mr-2 h-4 w-4" />
              Add Deal
            </Button>
          </div>
          <DataTable<Deal>
            label="Deals"
            noun="deal"
            rows={fund.deals}
            rowKey={(d) => d.id}
            columns={dealColumns}
            defaultSort={{ key: "date", dir: "desc" }}
            searchText={(d) => [d.portfolioCompanyName, d.instrument]}
            searchPlaceholder="Filter by company or instrument"
            urlState={false}
            minWidth={900}
            actionsLabel="Row actions"
            rowActions={(d) =>
              fund.sheetsSyncEnabled && Boolean(d.sheetRowId) ? null : (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete deal with ${d.portfolioCompanyName}`}
                  title="Delete"
                  className="hover:text-laterite"
                  onClick={() => handleDeleteDeal(d.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )
            }
            empty={<EmptyState icon={<Layers className="h-8 w-8" />} title="No deals yet" description="Add the fund's first deal." />}
          />
        </div>
      )}

      {activeTab === "lps" && (
        <div>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-56">
              <Select id="assignLp" label="Assign existing LP" value={assignLpId} onChange={(e) => setAssignLpId(e.target.value)}>
                <option value="">Select an LP...</option>
                {unassignedLps.map((lp) => (
                  <option key={lp.id} value={lp.id}>
                    {lp.name ? `${lp.name} — ${lp.email}` : lp.email}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" disabled={!assignLpId || assigning} onClick={handleAssignLp}>
              {assigning ? "Assigning..." : "Assign"}
            </Button>
            <p className="text-xs text-muted-foreground">
              New LPs are created on the <a href="/admin/lps" className="text-primary hover:underline">LPs</a> page.
            </p>
          </div>

          {fund.lps.length === 0 ? (
            <EmptyState icon={<Handshake className="h-8 w-8" />} title="No LPs assigned" description="Assign an LP to this fund." />
          ) : (
            <div className="space-y-2">
              {fund.lps.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium">{m.lp.name ?? m.lp.email}</span>
                    {m.lp.name && <span className="ml-2 text-xs text-muted-foreground">{m.lp.email}</span>}
                  </div>
                  <button onClick={() => handleUnassignLp(m.lp.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-laterite" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "reports" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Reports</h3>
            <Link href={`/admin/reports?fundId=${fund.id}`} className="text-sm text-primary hover:underline">
              Manage reports for this fund →
            </Link>
          </div>
          {fund.reports.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No reports yet"
              description="Create the fund's first LP report."
              action={
                <Link href={`/admin/reports?fundId=${fund.id}`}>
                  <Button size="sm">New Report</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {fund.reports.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/reports/${r.id}`}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2.5 hover:border-primary/40 transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium">{r.title}</span>
                    {r.periodLabel && <span className="ml-2 text-xs text-muted-foreground">{r.periodLabel}</span>}
                  </div>
                  <Badge variant={r.status === "PUBLISHED" ? "success" : "warning"}>{r.status === "PUBLISHED" ? "Published" : "Draft"}</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "cashflows" && (
        <div>
          <div className="mb-4 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Recording capital calls, distributions, and fees here feeds the Performance card above (Part 10, WS26) — DPI moves as distributions are added, and TVPI/DPI drop their &quot;≈&quot; badge once a capital call is recorded.
          </div>
          <form onSubmit={handleAddCashflow} className="mb-4 rounded-md border border-border bg-card p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select id="cashflowKind" label="Kind" value={cashflowForm.kind} onChange={(e) => setCashflowForm((f) => ({ ...f, kind: e.target.value as Cashflow["kind"] }))}>
                {CASHFLOW_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CASHFLOW_LABELS[k]}
                  </option>
                ))}
              </Select>
              <Input label="Date *" type="date" required value={cashflowForm.date} onChange={(e) => setCashflowForm((f) => ({ ...f, date: e.target.value }))} />
              <Input label="Amount (USD) *" type="number" required value={cashflowForm.amountUsd} onChange={(e) => setCashflowForm((f) => ({ ...f, amountUsd: e.target.value }))} />
              <Select id="cashflowCompany" label="Company (optional)" value={cashflowForm.portfolioCompanyId} onChange={(e) => setCashflowForm((f) => ({ ...f, portfolioCompanyId: e.target.value }))}>
                <option value="">None</option>
                {portfolioCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-3">
              <Input label="Notes" value={cashflowForm.notes} onChange={(e) => setCashflowForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {cashflowError && <p className="mt-2 text-sm text-laterite">{cashflowError}</p>}
            <div className="mt-3 flex justify-end">
              <Button type="submit" size="sm" disabled={savingCashflow}>
                {savingCashflow ? "Adding..." : "Add Cashflow"}
              </Button>
            </div>
          </form>

          <DataTable<Cashflow>
            label="Cashflows"
            noun="cashflow"
            rows={fund.cashflows}
            rowKey={(c) => c.id}
            columns={cashflowColumns}
            defaultSort={{ key: "date", dir: "desc" }}
            searchText={(c) => [CASHFLOW_LABELS[c.kind], c.portfolioCompanyName, c.notes]}
            searchPlaceholder="Filter cashflows"
            urlState={false}
            minWidth={640}
            actionsLabel="Row actions"
            rowActions={(c) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${CASHFLOW_LABELS[c.kind].toLowerCase()} of $${c.amountUsd.toLocaleString()}`}
                title="Delete"
                className="hover:text-laterite"
                onClick={() => handleDeleteCashflow(c.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            empty={<EmptyState icon={<DollarSign className="h-8 w-8" />} title="No cashflows recorded" description="Capital calls, distributions, and fees show up here." />}
          />
        </div>
      )}

      {showAddDeal && (
        <Modal title="Add Deal" onClose={() => setShowAddDeal(false)}>
          <form onSubmit={handleAddDeal} className="space-y-4">
            <Select id="dealCompany" label="Portfolio company *" required value={dealForm.portfolioCompanyId} onChange={(e) => setDealForm((f) => ({ ...f, portfolioCompanyId: e.target.value }))}>
              <option value="">Select...</option>
              {portfolioCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new__">+ New company…</option>
            </Select>
            {dealForm.portfolioCompanyId === "__new__" && (
              <Input
                label="New company name *"
                required
                value={dealForm.newCompanyName}
                onChange={(e) => setDealForm((f) => ({ ...f, newCompanyName: e.target.value }))}
              />
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select id="dealType" label="Type" value={dealForm.investmentType} onChange={(e) => setDealForm((f) => ({ ...f, investmentType: e.target.value as "INITIAL" | "FOLLOW_ON" }))}>
                <option value="INITIAL">Initial</option>
                <option value="FOLLOW_ON">Follow-on</option>
              </Select>
              <Input
                label="Deal date *"
                type="date"
                required
                value={dealForm.dealDate}
                onChange={(e) => setDealForm((f) => ({ ...f, dealDate: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Country" value={dealForm.country} onChange={(e) => setDealForm((f) => ({ ...f, country: e.target.value }))} />
              <Input
                label="Amount (USD) *"
                type="number"
                required
                value={dealForm.amountUsd}
                onChange={(e) => setDealForm((f) => ({ ...f, amountUsd: e.target.value }))}
              />
            </div>

            <Input label="Instrument" value={dealForm.instrument} onChange={(e) => setDealForm((f) => ({ ...f, instrument: e.target.value }))} placeholder="e.g. Preferred Shares" />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Entry valuation (USD)"
                type="number"
                value={dealForm.entryValuation}
                onChange={(e) => setDealForm((f) => ({ ...f, entryValuation: e.target.value }))}
              />
              <Input
                label="Current valuation (USD)"
                type="number"
                value={dealForm.currentValuation}
                onChange={(e) => setDealForm((f) => ({ ...f, currentValuation: e.target.value }))}
              />
            </div>

            <div>
              <label className="label mb-1.5 block">Notes</label>
              <textarea
                value={dealForm.notes}
                onChange={(e) => setDealForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>

            {dealError && <p className="text-sm text-laterite">{dealError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddDeal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingDeal}>
                {savingDeal ? "Adding..." : "Add Deal"}
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
      <div className="absolute inset-0 bg-obsidian/35" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-float max-h-[90vh] overflow-y-auto">
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
