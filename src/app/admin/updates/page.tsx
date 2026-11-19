"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { FileText, LayoutTemplate } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { SplitView, useOpenParam } from "@/components/layout/split-view";
import { DetailPane, PaneChip, PaneDetails, PaneSection } from "@/components/layout/detail-pane";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { NameTile } from "@/components/ui/name-tile";
import { TemplatesPanel } from "@/components/admin/templates-panel";
import { fetcher } from "@/lib/fetcher";
import { crumbLabel, stepCursor } from "@/lib/split-view";
import { sanitizeUpdateHtml } from "@/lib/update-html";
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


// What GET /api/updates/[id] returns that the pane shows (the same fetch the full page makes).
interface UpdateDetail {
  id: string;
  body?: string | null;
  metricValues?: { id: string; value: number; date: string; metricDefinition: { name: string; unit: string | null } }[];
}

const UPDATE_COLUMNS: DataTableColumn<Update>[] = [
  { key: "title", header: "Update", sortValue: (u) => u.title, cell: (u) => u.title },
  { key: "company", header: "Company", sortValue: (u) => u.company.name, mobile: "meta", cell: (u) => u.company.name },
  { key: "period", header: "Period", dropBelow: 480, mobile: "meta", cell: (u) => formatPeriod(u.period) },
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
    dropBelow: 600,
    sortValue: (u) => u.createdBy?.name,
    cell: (u) => u.createdBy?.name ?? <span className="text-muted-foreground">—</span>,
  },
];

// New look (WS160): the update, read-only, beside the list. The row has the facts for the crumb and
// chips; the body and figures come from the same endpoint the full page reads, fetched only while open.
function UpdatePane({
  update,
  crumb,
  onPrev,
  onNext,
  onClose,
}: {
  update: Update;
  crumb: string;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const { data, error, isLoading } = useSWR<{ data?: UpdateDetail } | UpdateDetail>(`/api/updates/${update.id}`, fetcher);
  const detail: UpdateDetail | undefined = data && "data" in data && data.data ? data.data : (data as UpdateDetail | undefined);
  const figures = detail?.metricValues ?? [];
  return (
    <DetailPane
      crumb={crumb}
      title={update.title}
      mark={<NameTile name={update.company.name} className="mr-0 v2:h-8 v2:w-8 v2:text-[13px]" />}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      expandHref={`/updates/${update.id}`}
      chips={
        <>
          <PaneChip>{update.company.name}</PaneChip>
          <PaneChip>{formatPeriod(update.period)}</PaneChip>
          {update.sentAt && <PaneChip>Published {formatDate(update.sentAt)}</PaneChip>}
          {update.createdBy?.name && <PaneChip>{update.createdBy.name}</PaneChip>}
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-body text-secondary">
          Couldn&apos;t load this update.
        </p>
      ) : isLoading || !detail ? (
        <p className="text-body text-muted-foreground" aria-busy="true">
          Loading…
        </p>
      ) : (
        <>
          <PaneSection title="Update">
            {detail.body ? (
              <div
                className="prose prose-sm max-w-none text-body"
                dangerouslySetInnerHTML={{ __html: sanitizeUpdateHtml(detail.body) }}
              />
            ) : (
              <p>No content yet.</p>
            )}
          </PaneSection>
          <PaneSection title="Figures">
            {figures.length === 0 ? (
              <p>No figures yet.</p>
            ) : (
              <PaneDetails
                rows={figures.map((mv) => ({
                  label: mv.metricDefinition.name,
                  value: `${mv.value}${mv.metricDefinition.unit ? ` ${mv.metricDefinition.unit}` : ""} · ${formatDate(mv.date)}`,
                }))}
              />
            )}
          </PaneSection>
        </>
      )}
    </DetailPane>
  );
}

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

  // New look (WS160): the open update lives in ?open=, and the list as shown gives the pane its
  // position and previous / next.
  const [openId, setOpenId] = useOpenParam();
  const [visibleRows, setVisibleRows] = useState<Update[]>([]);
  const visibleKeys = useMemo(() => visibleRows.map((u) => u.id), [visibleRows]);
  const closePane = useCallback(() => setOpenId(null), [setOpenId]);
  const stepOpen = (delta: 1 | -1) => {
    const to = stepCursor(visibleKeys, openId, delta);
    if (to) setOpenId(to);
  };

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

  const openUpdate = openId ? (updates.find((u) => u.id === openId) ?? null) : null;
  const at = openUpdate ? visibleKeys.indexOf(openUpdate.id) : -1;

  return (
    <AppShell width="full">
      <PageHeader
        title="Updates"
        description={
          activeTab === "templates"
            ? "Pre-filled skeletons founders can start their update from."
            : "Every published update across the portfolio, in one feed."
        }
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b v2:border-b-0 v2:mx-[var(--row-pad)] v2:mb-0 v2:max-w-[var(--column-wide)] v2:gap-5">
        <button
          onClick={() => selectTab("updates")}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 v2:px-0 text-sm font-medium transition-colors ${
            activeTab === "updates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4 v2:hidden" />
          Updates
        </button>
        <button
          onClick={() => selectTab("templates")}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 v2:px-0 text-sm font-medium transition-colors ${
            activeTab === "templates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
          }`}
        >
          <LayoutTemplate className="h-4 w-4 v2:hidden" />
          Templates
        </button>
      </div>

      {activeTab === "templates" ? (
        <div className="v2:mx-[var(--row-pad)] v2:max-w-[var(--column-wide)] v2:py-6">
          <TemplatesPanel />
        </div>
      ) : (
        <SplitView
          open={openId}
          onClose={closePane}
          paneLabel={openUpdate?.title}
          pane={
            openUpdate ? (
              <UpdatePane
                update={openUpdate}
                crumb={crumbLabel("Updates", visibleKeys, openUpdate.id)}
                onPrev={at > 0 ? () => stepOpen(-1) : undefined}
                onNext={at !== -1 && at < visibleKeys.length - 1 ? () => stepOpen(1) : undefined}
                onClose={closePane}
              />
            ) : null
          }
          list={
        <DataTable<Update>
          onOpenRow={(u) => setOpenId(u.id)}
          openKey={openId}
          onVisibleRowsChange={setVisibleRows}
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
                className="h-8 w-auto py-0 text-[13px] v2:h-9 v2:bg-transparent v2:text-row"
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
          }
        />
      )}
    </AppShell>
  );
}
