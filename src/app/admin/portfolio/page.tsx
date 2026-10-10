"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";
import { multipleLabel, multipleValue, summarizeLedger, type LedgerSummary } from "@/lib/ledger";
import type { FilterChipDef } from "@/lib/data-table";

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

const money = (n: number) => `$${n.toLocaleString()}`;

const CHIPS: FilterChipDef<PortfolioDeal>[] = [
  { key: "initial", label: "Initial", test: (d) => d.investmentType === "INITIAL" },
  { key: "follow-on", label: "Follow-on", test: (d) => d.investmentType === "FOLLOW_ON" },
];

const COLUMNS: DataTableColumn<PortfolioDeal>[] = [
  {
    key: "company",
    header: "Company",
    sortValue: (d) => d.portfolioCompany.name,
    sticky: true,
    cell: (d) => d.portfolioCompany.name,
  },
  {
    key: "fund",
    header: "Fund",
    sortValue: (d) => d.fund.name,
    mobile: "meta",
    cell: (d) => (
      <Link href={`/admin/funds/${d.fund.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
        {d.fund.name}
      </Link>
    ),
  },
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
    mobile: "meta",
    className: "whitespace-nowrap",
    cell: (d) => formatDate(d.dealDate),
  },
  {
    key: "amount",
    header: "Amount",
    align: "num",
    sortValue: (d) => d.amountUsd,
    firstDir: "desc",
    mobile: "meta",
    cell: (d) => money(d.amountUsd),
  },
  { key: "instrument", header: "Instrument", cell: (d) => d.instrument ?? "—" },
  {
    key: "currentVal",
    header: "Current val.",
    align: "num",
    sortValue: (d) => d.currentValuation,
    firstDir: "desc",
    cell: (d) => (d.currentValuation !== null ? money(d.currentValuation) : "—"),
  },
  {
    key: "multiple",
    header: "Multiple",
    align: "num",
    sortValue: (d) => multipleValue(d),
    firstDir: "desc",
    cell: (d) => multipleLabel(d),
  },
  {
    key: "ownership",
    header: "Ownership",
    align: "num",
    cell: (d) => (d.ownershipPct !== null ? `${d.ownershipPct}%` : "—"),
  },
  {
    key: "positionValue",
    header: "Position value",
    align: "num",
    sortValue: (d) => d.positionValue,
    firstDir: "desc",
    mobile: "badge",
    cell: (d) => (
      <span className="inline-flex items-center justify-end gap-1.5">
        {!d.dilutionAware && d.positionValue !== null && (
          <span
            role="img"
            aria-label="No dilution data, zero-dilution assumption"
            className="h-[7px] w-[7px] shrink-0 bg-ochre"
            title="No dilution data: zero-dilution assumption (amount x multiple)"
          />
        )}
        {d.positionValue !== null ? money(Math.round(d.positionValue)) : "—"}
      </span>
    ),
  },
];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-semibold text-foreground">{value}</dd>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function AdminPortfolioPage() {
  return (
    <Suspense fallback={null}>
      <LedgerPage />
    </Suspense>
  );
}

function LedgerPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fundId = searchParams.get("fund") ?? "";

  const [deals, setDeals] = useState<PortfolioDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funds, setFunds] = useState<{ id: string; name: string }[]>([]);
  const [shown, setShown] = useState<PortfolioDeal[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/portfolio");
      if (!res.ok) throw new Error("Couldn't load the deal ledger.");
      const data = await res.json();
      setDeals(data.deals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the deal ledger.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/funds")
      .then((r) => (r.ok ? r.json() : []))
      .then(setFunds)
      .catch(() => {});
  }, []);

  function setFundParam(value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set("fund", value);
    else p.delete("fund");
    const qs = p.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const rows = useMemo(() => (fundId ? deals.filter((d) => d.fund.id === fundId) : deals), [deals, fundId]);
  // The strip follows whatever the table is showing (fund, type chip and search).
  const summary: LedgerSummary = useMemo(() => summarizeLedger(shown), [shown]);
  const onVisible = useCallback((r: PortfolioDeal[]) => setShown(r), []);

  return (
    <AppShell>
      <PageHeader
        title="Deal Ledger"
        description="Every deal across every fund — the cross-fund view the per-fund pages don't give you."
      />

      <dl
        aria-label="Totals for the deals shown"
        className="mb-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-border py-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <Stat label="Total invested" value={`$${summary.totalInvested.toLocaleString()}`} />
        <Stat
          label={`Implied value${!summary.anyDilutionAware && summary.dealCount > 0 ? " *" : ""}`}
          value={`$${Math.round(summary.blendedImpliedValue).toLocaleString()}`}
          hint="Admin-only estimate"
        />
        <Stat label="Deals" value={String(summary.dealCount)} />
        <Stat label="Companies" value={String(summary.companyCount)} />
        <Stat label="Funds" value={String(summary.fundCount)} />
      </dl>

      <DataTable<PortfolioDeal>
        label="Deals"
        noun="deal"
        rows={rows}
        rowKey={(d) => d.id}
        rowHref={(d) => `/admin/portfolio/${d.portfolioCompany.id}`}
        columns={COLUMNS}
        defaultSort={{ key: "date", dir: "desc" }}
        searchText={(d) => [d.portfolioCompany.name, d.instrument, d.fund.name]}
        searchPlaceholder="Filter company, instrument or fund"
        chips={CHIPS}
        toolbarExtra={
          <>
            <label htmlFor="ledger-fund" className="sr-only">
              Fund
            </label>
            <Select
              id="ledger-fund"
              value={fundId}
              onChange={(e) => setFundParam(e.target.value)}
              className="h-8 w-auto py-0 text-[13px]"
            >
              <option value="">All funds</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </>
        }
        loading={loading}
        error={error}
        onRetry={load}
        onVisibleRowsChange={onVisible}
        minWidth={1040}
        empty={
          <EmptyState
            icon={<Layers className="h-8 w-8" />}
            title={fundId ? "No deals in this fund" : "No deals yet"}
            description={
              fundId
                ? "Pick another fund, or show all funds."
                : "Deals appear here once they are added to a fund or synced from the sheet."
            }
          />
        }
      />
    </AppShell>
  );
}
