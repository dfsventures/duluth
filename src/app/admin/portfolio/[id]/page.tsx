"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers, History, TrendingUp, Plus, X, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

const ROUND_KINDS = ["UNKNOWN", "PRICED", "SAFE", "CONVERSION", "OTHER"];

interface Deal {
  id: string;
  fund: { id: string; name: string; slug: string };
  investmentType: "INITIAL" | "FOLLOW_ON";
  dealDate: string;
  amountUsd: number;
  instrument: string | null;
  entryValuation: number | null;
  currentValuation: number | null;
  valuationAsOf: string | null;
  roundId: string | null;
  round: { id: string; label: string | null; kind: string } | null;
  ownershipPct: number | null;
}

interface Round {
  id: string;
  label: string | null;
  kind: string;
  roundDate: string;
  raisedUsd: number | null;
  preMoneyUsd: number | null;
  postMoneyUsd: number | null;
  source: string;
  notes: string | null;
}

interface Mark {
  id: string;
  valuationUsd: number;
  asOf: string;
  source: string;
  notes: string | null;
}

interface Position {
  fund: { id: string; name: string; slug: string };
  invested: number;
  dealCount: number;
  latestMultiple: number | null;
}

interface CompanyDetail {
  id: string;
  name: string;
  country: string | null;
  company: { id: string; name: string } | null;
  deals: Deal[];
  rounds: Round[];
  marks: Mark[];
  latestValuation: number | null;
  positions: Position[];
}

function multipleLabel(m: number | null): string {
  if (m === null) return "n/a";
  if (m === 0) return "Written off";
  return `${m.toFixed(1)}×`;
}

export default function AdminPortfolioCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;

  const [data, setData] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showRoundModal, setShowRoundModal] = useState(false);
  const [editingRound, setEditingRound] = useState<Round | null>(null);
  const [roundForm, setRoundForm] = useState({ label: "", kind: "UNKNOWN", roundDate: "", raisedUsd: "", preMoneyUsd: "", postMoneyUsd: "", notes: "" });
  const [savingRound, setSavingRound] = useState(false);
  const [roundError, setRoundError] = useState("");

  const [markForm, setMarkForm] = useState({ valuationUsd: "", asOf: "", notes: "" });
  const [savingMark, setSavingMark] = useState(false);
  const [markError, setMarkError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/portfolio/companies/${companyId}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  function openNewRound() {
    setEditingRound(null);
    setRoundForm({ label: "", kind: "UNKNOWN", roundDate: "", raisedUsd: "", preMoneyUsd: "", postMoneyUsd: "", notes: "" });
    setRoundError("");
    setShowRoundModal(true);
  }

  function openEditRound(r: Round) {
    setEditingRound(r);
    setRoundForm({
      label: r.label ?? "",
      kind: r.kind,
      roundDate: r.roundDate.slice(0, 10),
      raisedUsd: r.raisedUsd !== null ? String(r.raisedUsd) : "",
      preMoneyUsd: r.preMoneyUsd !== null ? String(r.preMoneyUsd) : "",
      postMoneyUsd: r.postMoneyUsd !== null ? String(r.postMoneyUsd) : "",
      notes: r.notes ?? "",
    });
    setRoundError("");
    setShowRoundModal(true);
  }

  async function handleSaveRound(e: React.FormEvent) {
    e.preventDefault();
    setSavingRound(true);
    setRoundError("");
    try {
      const body = {
        portfolioCompanyId: companyId,
        label: roundForm.label.trim() || null,
        kind: roundForm.kind,
        roundDate: roundForm.roundDate,
        raisedUsd: roundForm.raisedUsd || null,
        preMoneyUsd: roundForm.preMoneyUsd || null,
        postMoneyUsd: roundForm.postMoneyUsd || null,
        notes: roundForm.notes.trim() || null,
      };
      const res = editingRound
        ? await fetch(`/api/admin/rounds/${editingRound.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/admin/rounds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to save round");
      }
      setShowRoundModal(false);
      load();
    } catch (err) {
      setRoundError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingRound(false);
    }
  }

  async function handleDeleteRound(id: string) {
    if (!window.confirm("Delete this round? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/rounds/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setMessage({ type: "error", text: d?.error ?? "Failed to delete round." });
      return;
    }
    load();
  }

  async function handleAssignRound(dealId: string, roundId: string) {
    const res = await fetch(`/api/admin/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: roundId || null }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setMessage({ type: "error", text: d?.error ?? "Failed to assign round." });
      return;
    }
    load();
  }

  async function handleSaveOwnership(dealId: string, value: string) {
    const res = await fetch(`/api/admin/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownershipPct: value === "" ? null : Number(value) }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setMessage({ type: "error", text: d?.error ?? "Failed to update ownership." });
      return;
    }
    load();
  }

  async function handleRecordMark(e: React.FormEvent) {
    e.preventDefault();
    setSavingMark(true);
    setMarkError("");
    try {
      const res = await fetch(`/api/admin/portfolio-companies/${companyId}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valuationUsd: markForm.valuationUsd,
          asOf: markForm.asOf || undefined,
          notes: markForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to record mark");
      }
      setMarkForm({ valuationUsd: "", asOf: "", notes: "" });
      load();
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingMark(false);
    }
  }

  async function handleDeleteMark(id: string) {
    if (!window.confirm("Delete this valuation-mark record? This only removes history — it does not change the current valuation.")) return;
    await fetch(`/api/admin/marks/${id}`, { method: "DELETE" });
    load();
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

  if (!data) {
    return (
      <AppShell>
        <Button variant="secondary" onClick={() => router.push("/admin/portfolio")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Portfolio
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <button
        onClick={() => router.push("/admin/portfolio")}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Portfolio
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{data.name}</h1>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {data.country && <span>{data.country}</span>}
              {data.latestValuation !== null && <span>Latest valuation ${data.latestValuation.toLocaleString()}</span>}
              {data.company && (
                <Link href={`/admin/companies/${data.company.id}`} className="text-primary hover:underline">
                  View operational company profile
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Positions (computed, per fund) */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <TrendingUp className="h-4 w-4" />
          Positions by fund
        </h3>
        {data.positions.length === 0 ? (
          <EmptyState icon={<Layers className="h-6 w-6" />} title="No positions yet" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.positions.map((p) => (
              <div key={p.fund.id} className="rounded-md border border-border bg-card p-3">
                <Link href={`/admin/funds/${p.fund.id}`} className="text-sm font-medium hover:underline">
                  {p.fund.name}
                </Link>
                <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>${p.invested.toLocaleString()} invested</span>
                  <span>{p.dealCount} deal{p.dealCount !== 1 ? "s" : ""}</span>
                  <span>{multipleLabel(p.latestMultiple)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deals across funds */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Layers className="h-4 w-4" />
          Deals across funds
        </h3>
        {data.deals.length === 0 ? (
          <EmptyState icon={<Layers className="h-6 w-6" />} title="No deals yet" />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Fund</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Round</th>
                  <th className="px-3 py-2 font-medium">Ownership %</th>
                </tr>
              </thead>
              <tbody>
                {data.deals.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/admin/funds/${d.fund.id}`} className="hover:underline">
                        {d.fund.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={d.investmentType === "INITIAL" ? "info" : "neutral"}>
                        {d.investmentType === "INITIAL" ? "Initial" : "Follow-on"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(d.dealDate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">${d.amountUsd.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <select
                        value={d.roundId ?? ""}
                        onChange={(e) => handleAssignRound(d.id, e.target.value)}
                        className="rounded-sm border border-input bg-card px-2 py-1 text-xs"
                      >
                        <option value="">Unassigned</option>
                        {data.rounds.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label ?? formatDate(r.roundDate)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        defaultValue={d.ownershipPct ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== String(d.ownershipPct ?? "")) handleSaveOwnership(d.id, e.target.value);
                        }}
                        placeholder="—"
                        className="w-20 rounded-sm border border-input bg-card px-2 py-1 text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rounds timeline */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <History className="h-4 w-4" />
            Financing rounds
          </h3>
          <Button size="sm" onClick={openNewRound}>
            <Plus className="mr-2 h-4 w-4" />
            New Round
          </Button>
        </div>
        {data.rounds.length === 0 ? (
          <EmptyState icon={<History className="h-6 w-6" />} title="No rounds recorded" />
        ) : (
          <div className="space-y-2">
            {data.rounds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.label ?? "Untitled round"}</span>
                    <Badge variant="neutral">{r.kind}</Badge>
                    {r.source === "BACKFILL" && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">backfilled</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(r.roundDate)}</span>
                    {r.raisedUsd !== null && <span>Raised ${r.raisedUsd.toLocaleString()}</span>}
                    {r.postMoneyUsd !== null && <span>Post-money ${r.postMoneyUsd.toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => openEditRound(r)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDeleteRound(r.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-laterite" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Valuation marks */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <TrendingUp className="h-4 w-4" />
          Valuation history
        </h3>
        <form onSubmit={handleRecordMark} className="mb-4 rounded-md border border-border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Recording a mark updates the current valuation on all of this company&apos;s deals.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="Valuation (USD)"
              type="number"
              min={0}
              value={markForm.valuationUsd}
              onChange={(e) => setMarkForm({ ...markForm, valuationUsd: e.target.value })}
              required
            />
            <Input
              label="As of"
              type="date"
              value={markForm.asOf}
              onChange={(e) => setMarkForm({ ...markForm, asOf: e.target.value })}
            />
            <Input
              label="Notes (optional)"
              value={markForm.notes}
              onChange={(e) => setMarkForm({ ...markForm, notes: e.target.value })}
            />
            <Button type="submit" size="sm" disabled={savingMark}>
              {savingMark ? "Recording..." : "Record mark"}
            </Button>
          </div>
          {markError && <p className="mt-2 text-xs text-laterite">{markError}</p>}
        </form>
        {data.marks.length === 0 ? (
          <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No valuation marks yet" />
        ) : (
          <div className="space-y-2">
            {data.marks.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">${m.valuationUsd.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(m.asOf)}</span>
                  {m.source === "BACKFILL" && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">backfilled</span>}
                  {m.source === "SHEET" && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">from sheet</span>}
                </div>
                <button onClick={() => handleDeleteMark(m.id)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-laterite" title="Delete (history only)">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRoundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRoundModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-semibold text-foreground">{editingRound ? "Edit Round" : "New Round"}</h2>
              <button onClick={() => setShowRoundModal(false)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRound} className="space-y-3 px-6 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Label" value={roundForm.label} onChange={(e) => setRoundForm({ ...roundForm, label: e.target.value })} placeholder="Seed, Series A, SAFE (2024)..." />
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Kind</label>
                  <select
                    value={roundForm.kind}
                    onChange={(e) => setRoundForm({ ...roundForm, kind: e.target.value })}
                    className="w-full rounded-sm border border-input bg-card px-3 py-2 text-sm"
                  >
                    {ROUND_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Input label="Round date" type="date" value={roundForm.roundDate} onChange={(e) => setRoundForm({ ...roundForm, roundDate: e.target.value })} required />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input label="Raised (USD)" type="number" value={roundForm.raisedUsd} onChange={(e) => setRoundForm({ ...roundForm, raisedUsd: e.target.value })} />
                <Input label="Pre-money (USD)" type="number" value={roundForm.preMoneyUsd} onChange={(e) => setRoundForm({ ...roundForm, preMoneyUsd: e.target.value })} />
                <Input label="Post-money (USD)" type="number" value={roundForm.postMoneyUsd} onChange={(e) => setRoundForm({ ...roundForm, postMoneyUsd: e.target.value })} />
              </div>
              <Input label="Notes" value={roundForm.notes} onChange={(e) => setRoundForm({ ...roundForm, notes: e.target.value })} />
              {roundError && <p className="text-xs text-laterite">{roundError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowRoundModal(false)} disabled={savingRound}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={savingRound}>
                  {savingRound ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
