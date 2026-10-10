"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, LayoutTemplate } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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


const UPDATE_COLUMNS: DataTableColumn<Update>[] = [
  { key: "title", header: "Update", sortValue: (u) => u.title, cell: (u) => u.title },
  { key: "company", header: "Company", sortValue: (u) => u.company.name, mobile: "meta", cell: (u) => u.company.name },
  { key: "period", header: "Period", mobile: "meta", cell: (u) => formatPeriod(u.period) },
  {
    key: "published",
    header: "Published",
    align: "num",
    sortValue: (u) => (u.sentAt ? new Date(u.sentAt).getTime() : null),
    firstDir: "desc",
    mobile: "meta",
    cell: (u) => (u.sentAt ? formatDate(u.sentAt) : "—"),
  },
  {
    key: "author",
    header: "Author",
    sortValue: (u) => u.createdBy?.name,
    cell: (u) => u.createdBy?.name ?? <span className="text-muted-foreground">—</span>,
  },
];

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
  const [error, setError] = useState<string | null>(null);
  const companyFilter = searchParams.get("company") ?? "";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/updates");
      if (!res.ok) throw new Error("Couldn't load updates.");
      setUpdates(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load updates.");
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

  const rows = useMemo(
    () => (companyFilter ? updates.filter((u) => u.company.id === companyFilter) : updates),
    [updates, companyFilter]
  );

  function setCompanyParam(value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set("company", value);
    else p.delete("company");
    const qs = p.toString();
    router.replace(`/admin/updates${qs ? `?${qs}` : ""}`, { scroll: false });
  }

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
        <DataTable<Update>
          label="Updates"
          noun="update"
          rows={rows}
          rowKey={(u) => u.id}
          rowHref={(u) => `/updates/${u.id}`}
          columns={UPDATE_COLUMNS}
          defaultSort={{ key: "published", dir: "desc" }}
          searchText={(u) => [u.title, u.company.name]}
          searchPlaceholder="Filter by title or company"
          toolbarExtra={
            <>
              <label htmlFor="updates-company" className="sr-only">
                Company
              </label>
              <Select
                id="updates-company"
                value={companyFilter}
                onChange={(e) => setCompanyParam(e.target.value)}
                className="h-8 w-auto py-0 text-[13px]"
              >
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </>
          }
          loading={loading}
          error={error}
          onRetry={loadData}
          minWidth={720}
          empty={
            <EmptyState eyebrow="Updates"
              icon={<FileText className="h-8 w-8" />}
              title="No published updates yet"
              description="Once founders publish updates, they'll show up here across the whole portfolio."
            />
          }
        />
      )}
    </AppShell>
  );
}
