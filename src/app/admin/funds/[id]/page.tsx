"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

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

function multipleLabel(entry: number | null, current: number | null): string {
  if (entry === null || entry <= 0 || current === null) return "n/a";
  if (current === 0) return "Written off";
  return `${(current / entry).toFixed(1)}×`;
}

export default function AdminFundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fundId = params.id as string;

  const [fund, setFund] = useState<FundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("deals");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [portfolioCompanies, setPortfolioCompanies] = useState<PortfolioCompanyOption[]>([]);
  const [allLps, setAllLps] = useState<LpOption[]>([]);

  // Header edit
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerName, setHeaderName] = useState("");
  const [headerGroupLabel, setHeaderGroupLabel] = useState("");
  const [headerAum, setHeaderAum] = useState("");
  const [savingHeader, setSavingHeader] = useState(false);

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

  async function handleDeleteDeal(dealId: string) {
    if (!window.confirm("Delete this deal? This cannot be undone.")) return;
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
    if (!window.confirm("Delete this cashflow record? This cannot be undone.")) return;
    await fetch(`/api/admin/cashflows/${id}`, { method: "DELETE" });
    loadFund();
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "deals", label: `Deals (${fund.deals.length})`, icon: <Layers className="h-4 w-4" /> },
    { key: "lps", label: `LPs (${fund.lps.length})`, icon: <Handshake className="h-4 w-4" /> },
    { key: "reports", label: `Reports (${fund.reports.length})`, icon: <FileText className="h-4 w-4" /> },
    { key: "cashflows", label: `Cashflows (${fund.cashflows.length})`, icon: <DollarSign className="h-4 w-4" /> },
  ];

  return (
    <AppShell>
      <button
        onClick={() => router.push("/admin/funds")}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Funds
      </button>

      {message && (
        <div
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${
            message.type === "success" ? "border-acacia/30 bg-acacia/10 text-acacia" : "border-laterite/30 bg-laterite/10 text-laterite"
          }`}
        >
          {message.text}
        </div>
      )}

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

      {/* Performance (WS26, admin-only estimate — Q23) */}
      <div className="mb-6 rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Performance</h3>
          <span className="text-xs text-muted-foreground">As of {formatDate(fund.performance.asOf)}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">Invested</p>
            <p className="font-mono text-lg font-semibold">${fund.performance.invested.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Implied Value{fund.performance.dilutionAware ? "" : " *"}</p>
            <p className="font-mono text-lg font-semibold">${Math.round(fund.performance.impliedValue).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">TVPI{fund.performance.approximate ? " ≈" : ""}</p>
            <p className="font-mono text-lg font-semibold">{fund.performance.tvpi !== null ? `${fund.performance.tvpi.toFixed(2)}x` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">DPI{fund.performance.approximate ? " ≈" : ""}</p>
            <p className="font-mono text-lg font-semibold">{fund.performance.dpi !== null ? `${fund.performance.dpi.toFixed(2)}x` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Gross IRR</p>
            <p className="font-mono text-lg font-semibold" title={fund.performance.grossIrr === null ? "Doesn't converge with the cashflow data recorded so far" : undefined}>
              {fund.performance.grossIrr !== null ? `${(fund.performance.grossIrr * 100).toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Admin-only estimate; gross of fees unless FEE cashflow rows are recorded.
          {fund.performance.approximate && " TVPI/DPI use total invested as a paid-in stand-in — no capital-call rows recorded yet, so treat as approximate."}
          {!fund.performance.dilutionAware && " * Implied value assumes zero dilution (no ownership % recorded on these deals yet)."}
        </p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "deals" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Deals</h3>
            <Button size="sm" onClick={openAddDeal}>
              <Plus className="mr-2 h-4 w-4" />
              Add Deal
            </Button>
          </div>
          {fund.deals.length === 0 ? (
            <EmptyState icon={<Layers className="h-8 w-8" />} title="No deals yet" description="Add the fund's first deal." />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Instrument</th>
                    <th className="px-3 py-2 font-medium">Entry Val.</th>
                    <th className="px-3 py-2 font-medium">Current Val.</th>
                    <th className="px-3 py-2 font-medium">Multiple</th>
                    <th className="px-3 py-2 font-medium">As of</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {fund.deals.map((d) => {
                    // Part 10, WS27.5 — both conditions, mirroring the API's
                    // own enforcement: a fork with sync disabled, or a
                    // manually-created deal (no sheetRowId), is unaffected.
                    const isSynced = fund.sheetsSyncEnabled && Boolean(d.sheetRowId);
                    return (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{d.portfolioCompanyName}</td>
                      <td className="px-3 py-2">
                        <Badge variant={d.investmentType === "INITIAL" ? "info" : "neutral"}>
                          {d.investmentType === "INITIAL" ? "Initial" : "Follow-on"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(d.dealDate)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">${d.amountUsd.toLocaleString()}</td>
                      <td className="px-3 py-2">{d.instrument ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{d.entryValuation !== null ? `$${d.entryValuation.toLocaleString()}` : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isSynced ? (
                          <span>{d.currentValuation !== null ? `$${d.currentValuation.toLocaleString()}` : "—"}</span>
                        ) : editingDealId === d.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              autoFocus
                              value={editDealValuation}
                              onChange={(e) => setEditDealValuation(e.target.value)}
                              className="w-28 rounded-sm border border-input bg-card px-2 py-1 text-sm"
                            />
                            <button onClick={() => saveEditValuation(d.id)} className="rounded p-1 text-acacia hover:bg-muted" title="Save">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setEditingDealId(null)} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button className="hover:underline" onClick={() => startEditValuation(d)} title="Edit valuation">
                            {d.currentValuation !== null ? `$${d.currentValuation.toLocaleString()}` : "—"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">{multipleLabel(d.entryValuation, d.currentValuation)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{d.valuationAsOf ? formatDate(d.valuationAsOf) : "—"}</td>
                      <td className="px-3 py-2">
                        {isSynced ? (
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground" title="Sheet-owned fields are read-only while sync is enabled">
                            synced from sheet
                          </span>
                        ) : (
                          <button onClick={() => handleDeleteDeal(d.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-laterite" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "lps" && (
        <div>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-56">
              <label className="label mb-1.5 block">Assign existing LP</label>
              <select
                value={assignLpId}
                onChange={(e) => setAssignLpId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select an LP...</option>
                {unassignedLps.map((lp) => (
                  <option key={lp.id} value={lp.id}>
                    {lp.name ? `${lp.name} — ${lp.email}` : lp.email}
                  </option>
                ))}
              </select>
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
              <div>
                <label className="label mb-1.5 block">Kind</label>
                <select
                  value={cashflowForm.kind}
                  onChange={(e) => setCashflowForm((f) => ({ ...f, kind: e.target.value as Cashflow["kind"] }))}
                  className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground"
                >
                  {CASHFLOW_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {CASHFLOW_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <Input label="Date *" type="date" required value={cashflowForm.date} onChange={(e) => setCashflowForm((f) => ({ ...f, date: e.target.value }))} />
              <Input label="Amount (USD) *" type="number" required value={cashflowForm.amountUsd} onChange={(e) => setCashflowForm((f) => ({ ...f, amountUsd: e.target.value }))} />
              <div>
                <label className="label mb-1.5 block">Company (optional)</label>
                <select
                  value={cashflowForm.portfolioCompanyId}
                  onChange={(e) => setCashflowForm((f) => ({ ...f, portfolioCompanyId: e.target.value }))}
                  className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground"
                >
                  <option value="">None</option>
                  {portfolioCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
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

          {fund.cashflows.length === 0 ? (
            <EmptyState icon={<DollarSign className="h-8 w-8" />} title="No cashflows recorded" description="Capital calls, distributions, and fees show up here." />
          ) : (
            <div className="space-y-2">
              {fund.cashflows.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={c.kind === "DISTRIBUTION" ? "success" : c.kind === "CAPITAL_CALL" ? "info" : "neutral"}>{CASHFLOW_LABELS[c.kind]}</Badge>
                    <span className="text-sm font-medium">${c.amountUsd.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(c.date)}</span>
                    {c.portfolioCompanyName && <span className="text-xs text-muted-foreground">{c.portfolioCompanyName}</span>}
                    {c.notes && <span className="text-xs text-muted-foreground">{c.notes}</span>}
                  </div>
                  <button onClick={() => handleDeleteCashflow(c.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-laterite" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddDeal && (
        <Modal title="Add Deal" onClose={() => setShowAddDeal(false)}>
          <form onSubmit={handleAddDeal} className="space-y-4">
            <div>
              <label className="label mb-1.5 block">Portfolio company *</label>
              <select
                required
                value={dealForm.portfolioCompanyId}
                onChange={(e) => setDealForm((f) => ({ ...f, portfolioCompanyId: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select...</option>
                {portfolioCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ New company…</option>
              </select>
            </div>
            {dealForm.portfolioCompanyId === "__new__" && (
              <Input
                label="New company name *"
                required
                value={dealForm.newCompanyName}
                onChange={(e) => setDealForm((f) => ({ ...f, newCompanyName: e.target.value }))}
              />
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label mb-1.5 block">Type</label>
                <select
                  value={dealForm.investmentType}
                  onChange={(e) => setDealForm((f) => ({ ...f, investmentType: e.target.value as "INITIAL" | "FOLLOW_ON" }))}
                  className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="INITIAL">Initial</option>
                  <option value="FOLLOW_ON">Follow-on</option>
                </select>
              </div>
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
