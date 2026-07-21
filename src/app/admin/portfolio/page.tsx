"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Layers, Building2, Landmark, DollarSign, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, Th, SortableTh, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

interface PortfolioDeal {
  id: string;
  fund: { id: string; name: string; slug: string };
  portfolioCompany: { id: string; name: string; country: string | null };
  investmentType: "INITIAL" | "FOLLOW_ON";
  dealDate: string;
  amountUsd: number;
  instrument: string | null;
  entryValuation: number | null;
  currentValuation: number | null;
  valuationAsOf: string | null;
  round: { id: string; label: string | null; kind: string } | null;
  ownershipPct: number | null;
  positionValue: number | null;
  dilutionAware: boolean;
}

interface Summary {
  totalInvested: number;
  dealCount: number;
  companyCount: number;
  fundCount: number;
  blendedImpliedValue: number;
  anyDilutionAware: boolean;
}

function multipleLabel(entry: number | null, current: number | null): string {
  if (entry === null || entry <= 0 || current === null) return "n/a";
  if (current === 0) return "Written off";
  return `${(current / entry).toFixed(1)}×`;
}

function multipleValue(entry: number | null, current: number | null): number | null {
  if (entry === null || entry <= 0 || current === null) return null;
  return current / entry;
}

type SortKey = "company" | "fund" | "date" | "amount" | "currentVal" | "multiple" | "positionValue";
interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

// Column defaults: text columns sort A→Z first, numeric/date columns sort
// largest/most-recent first — matches the app's one existing sort default
// (dealDate desc).
const DEFAULT_SORT_DIR: Record<SortKey, "asc" | "desc"> = {
  company: "asc",
  fund: "asc",
  date: "desc",
  amount: "desc",
  currentVal: "desc",
  multiple: "desc",
  positionValue: "desc",
};

function sortValue(d: PortfolioDeal, key: SortKey): number | string | null {
  switch (key) {
    case "company":
      return d.portfolioCompany.name;
    case "fund":
      return d.fund.name;
    case "date":
      return new Date(d.dealDate).getTime();
    case "amount":
      return d.amountUsd;
    case "currentVal":
      return d.currentValuation;
    case "multiple":
      return multipleValue(d.entryValuation, d.currentValuation);
    case "positionValue":
      return d.positionValue;
  }
}

// Nulls always sort last regardless of direction, so toggling asc/desc
// doesn't make blank cells jump to the top.
function compareSortValues(a: number | string | null, b: number | string | null, dir: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : (a as number) - (b as number);
  return dir === "asc" ? result : -result;
}

export default function AdminPortfolioPage() {
  const [deals, setDeals] = useState<PortfolioDeal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<{ id: string; name: string }[]>([]);
  const [fundId, setFundId] = useState("");
  const [investmentType, setInvestmentType] = useState("");
  const [q, setQ] = useState("");
  // Default matches the API's existing order (dealDate desc) so nothing
  // visually shifts until a header is clicked (Q38-A acceptance criterion).
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "desc" });

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_SORT_DIR[key] }));
  }, []);

  const sortedDeals = useMemo(() => {
    return [...deals].sort((a, b) => compareSortValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.dir));
  }, [deals, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fundId) params.set("fundId", fundId);
      if (investmentType) params.set("investmentType", investmentType);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/portfolio?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDeals(data.deals);
        setSummary(data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [fundId, investmentType, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/funds")
      .then((r) => (r.ok ? r.json() : []))
      .then(setFunds)
      .catch(() => {});
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="Portfolio"
        description="Every deal across every fund — the cross-fund view the per-fund pages don't give you."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Total Invested
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary ? `$${summary.totalInvested.toLocaleString()}` : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Implied Value{summary && !summary.anyDilutionAware ? " *" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary ? `$${Math.round(summary.blendedImpliedValue).toLocaleString()}` : "—"}</p>
            <p className="text-xs text-muted-foreground">Admin-only estimate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Layers className="h-4 w-4" />
              Deals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary?.dealCount ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary?.companyCount ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Landmark className="h-4 w-4" />
              Funds
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary?.fundCount ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={fundId} onChange={(e) => setFundId(e.target.value)} className="w-auto">
          <option value="">All funds</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <Select value={investmentType} onChange={(e) => setInvestmentType(e.target.value)} className="w-auto">
          <option value="">All types</option>
          <option value="INITIAL">Initial</option>
          <option value="FOLLOW_ON">Follow-on</option>
        </Select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company or instrument..."
            className="w-full rounded-sm border border-input bg-card py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <EmptyState icon={<Layers className="h-8 w-8" />} title="No deals match" description="Try clearing the filters." />
      ) : (
        <Table tableClassName="min-w-[960px]">
          <TableHead>
            <SortableTh label="Company" sortKey="company" active={sort.key === "company"} dir={sort.dir} onSort={handleSort} />
            <SortableTh label="Fund" sortKey="fund" active={sort.key === "fund"} dir={sort.dir} onSort={handleSort} />
            <Th>Type</Th>
            <SortableTh label="Date" sortKey="date" active={sort.key === "date"} dir={sort.dir} onSort={handleSort} />
            <SortableTh label="Amount" sortKey="amount" active={sort.key === "amount"} dir={sort.dir} onSort={handleSort} />
            <Th>Instrument</Th>
            <SortableTh label="Current Val." sortKey="currentVal" active={sort.key === "currentVal"} dir={sort.dir} onSort={handleSort} />
            <SortableTh label="Multiple" sortKey="multiple" active={sort.key === "multiple"} dir={sort.dir} onSort={handleSort} />
            <Th>Ownership</Th>
            <SortableTh label="Position Value" sortKey="positionValue" active={sort.key === "positionValue"} dir={sort.dir} onSort={handleSort} />
          </TableHead>
          <tbody>
            {sortedDeals.map((d) => (
              <TableRow key={d.id}>
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/admin/portfolio/${d.portfolioCompany.id}`} className="hover:underline">
                    {d.portfolioCompany.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/admin/funds/${d.fund.id}`} className="text-muted-foreground hover:underline">
                    {d.fund.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={d.investmentType === "INITIAL" ? "info" : "neutral"}>
                    {d.investmentType === "INITIAL" ? "Initial" : "Follow-on"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(d.dealDate)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">${d.amountUsd.toLocaleString()}</td>
                <td className="px-4 py-2.5">{d.instrument ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{d.currentValuation !== null ? `$${d.currentValuation.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-2.5">{multipleLabel(d.entryValuation, d.currentValuation)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{d.ownershipPct !== null ? `${d.ownershipPct}%` : "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {d.positionValue !== null ? `$${Math.round(d.positionValue).toLocaleString()}` : "—"}
                    {!d.dilutionAware && d.positionValue !== null && (
                      <span className="h-1.5 w-1.5 rounded-full bg-ochre" title="No dilution data — zero-dilution assumption (amount x multiple)" />
                    )}
                  </span>
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </AppShell>
  );
}
