"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Layers, Building2, Landmark, DollarSign, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
}

interface Summary {
  totalInvested: number;
  dealCount: number;
  companyCount: number;
  fundCount: number;
}

function multipleLabel(entry: number | null, current: number | null): string {
  if (entry === null || entry <= 0 || current === null) return "n/a";
  if (current === 0) return "Written off";
  return `${(current / entry).toFixed(1)}×`;
}

export default function AdminPortfolioPage() {
  const [deals, setDeals] = useState<PortfolioDeal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<{ id: string; name: string }[]>([]);
  const [fundId, setFundId] = useState("");
  const [investmentType, setInvestmentType] = useState("");
  const [q, setQ] = useState("");

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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <select
          value={fundId}
          onChange={(e) => setFundId(e.target.value)}
          className="rounded-sm border border-input bg-card px-3 py-1.5 text-sm"
        >
          <option value="">All funds</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={investmentType}
          onChange={(e) => setInvestmentType(e.target.value)}
          className="rounded-sm border border-input bg-card px-3 py-1.5 text-sm"
        >
          <option value="">All types</option>
          <option value="INITIAL">Initial</option>
          <option value="FOLLOW_ON">Follow-on</option>
        </select>
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
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Fund</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Instrument</th>
                <th className="px-3 py-2 font-medium">Round</th>
                <th className="px-3 py-2 font-medium">Current Val.</th>
                <th className="px-3 py-2 font-medium">Multiple</th>
                <th className="px-3 py-2 font-medium">Ownership</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/admin/portfolio/${d.portfolioCompany.id}`} className="hover:underline">
                      {d.portfolioCompany.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/funds/${d.fund.id}`} className="text-muted-foreground hover:underline">
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
                  <td className="px-3 py-2">{d.instrument ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{d.round?.label ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.currentValuation !== null ? `$${d.currentValuation.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2">{multipleLabel(d.entryValuation, d.currentValuation)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{d.ownershipPct !== null ? `${d.ownershipPct}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
