"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, FileText, LayoutTemplate } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TemplatesPanel } from "@/components/admin/templates-panel";
import { formatDate, formatPeriod } from "@/lib/utils";

type UpdatesTab = "updates" | "templates";

interface Update {
  id: string;
  title: string;
  period: string;
  sentAt: string | null;
  company: { id: string; name: string };
  createdBy: { name: string | null } | null;
}

type SortOption = "newest" | "oldest" | "company";

export default function AdminUpdatesPage() {
  return (
    <Suspense fallback={null}>
      <AdminUpdatesPageInner />
    </Suspense>
  );
}

function AdminUpdatesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") === "templates" ? "templates" : "updates";
  const [activeTab, setActiveTab] = useState<UpdatesTab>(requestedTab);

  function selectTab(tab: UpdatesTab) {
    setActiveTab(tab);
    router.replace(tab === "templates" ? "/admin/updates?tab=templates" : "/admin/updates");
  }

  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/updates");
      if (res.ok) setUpdates(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const companies = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of updates) map.set(u.company.id, u.company.name);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [updates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = updates.filter((u) => {
      if (companyFilter && u.company.id !== companyFilter) return false;
      if (q && !u.title.toLowerCase().includes(q) && !u.company.name.toLowerCase().includes(q)) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sort === "company") {
        const cmp = a.company.name.localeCompare(b.company.name);
        if (cmp !== 0) return cmp;
        return (b.sentAt ?? "").localeCompare(a.sentAt ?? "");
      }
      const cmp = (a.sentAt ?? "").localeCompare(b.sentAt ?? "");
      return sort === "oldest" ? cmp : -cmp;
    });

    return result;
  }, [updates, search, companyFilter, sort]);

  const filteredCompanyCount = useMemo(
    () => new Set(filtered.map((u) => u.company.id)).size,
    [filtered]
  );

  return (
    <AppShell>
      <PageHeader
        title="Updates"
        description={
          activeTab === "templates"
            ? "Pre-filled skeletons founders can start their update from."
            : "Every published update across the portfolio, in one feed."
        }
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        <button
          onClick={() => selectTab("updates")}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "updates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
          Updates
        </button>
        <button
          onClick={() => selectTab("templates")}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "templates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
          }`}
        >
          <LayoutTemplate className="h-4 w-4" />
          Templates
        </button>
      </div>

      {activeTab === "templates" ? (
        <TemplatesPanel />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search title or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="w-auto">
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} className="w-auto">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="company">Company A–Z</option>
            </Select>
          </div>

          {/* Count */}
          {!loading && (
            <p className="mb-4 text-xs text-muted-foreground font-mono uppercase tracking-wider">
              {filtered.length} update{filtered.length !== 1 ? "s" : ""} · {filteredCompanyCount} compan{filteredCompanyCount !== 1 ? "ies" : "y"}
            </p>
          )}

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-md bg-muted animate-pulse" />)}
            </div>
          ) : updates.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No published updates yet"
              description="Once founders publish updates, they'll show up here across the whole portfolio."
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No published updates match your filters"
              description="Try a different search term or company."
            />
          ) : (
            <div className="space-y-4">
              {filtered.map((u) => (
                <Link key={u.id} href={`/updates/${u.id}`}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex flex-wrap items-center gap-3 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground text-sm">{u.title}</span>
                          <span className="text-xs text-muted-foreground">{u.company.name}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatPeriod(u.period)} · {u.sentAt ? formatDate(u.sentAt) : "—"}
                          {u.createdBy?.name ? ` · ${u.createdBy.name}` : ""}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
