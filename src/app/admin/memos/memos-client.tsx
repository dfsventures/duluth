"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { NotebookText, Plus, Settings2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TabBar } from "@/components/ui/tab-bar";
import { parseTab } from "@/lib/url-tab";
import { relativeTime } from "@/lib/relative-time";
import { MEMO_DECISIONS, MEMO_DECISION_LABELS, MEMO_STATUSES, MEMO_STATUS_LABELS } from "@/lib/memos";
import { STATUS_VARIANT, ownerLabel, type CompanyOption, type MemoRow } from "@/components/admin/memos/types";

const SCOPES = ["mine", "team", "all"] as const;
type Scope = (typeof SCOPES)[number];
const TABS = [
  { key: "mine" as const, label: "Mine" },
  { key: "team" as const, label: "Shared with team" },
  { key: "all" as const, label: "All I can see" },
];

export default function MemosClient({ companies }: { companies: CompanyOption[] }) {
  return (
    <Suspense fallback={null}>
      <MemosInner companies={companies} />
    </Suspense>
  );
}

function MemosInner({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const scope: Scope = parseTab(searchParams.get("tab"), SCOPES, "mine");

  const [rows, setRows] = useState<MemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [decision, setDecision] = useState("");
  const [unlinked, setUnlinked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (companyId) params.set("companyId", companyId);
      if (status) params.set("status", status);
      if (decision) params.set("decision", decision);
      if (unlinked) params.set("unlinked", "true");
      const res = await fetch(`/api/admin/memos?${params}`);
      if (!res.ok) throw new Error("Couldn't load memos.");
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load memos.");
    } finally {
      setLoading(false);
    }
  }, [scope, companyId, status, decision, unlinked]);
  useEffect(() => {
    load();
  }, [load]);

  const me = session?.user?.id;
  const filtered = !!(companyId || status || decision || unlinked);

  const columns = useMemo<DataTableColumn<MemoRow>[]>(
    () => [
      {
        key: "title",
        header: "Memo",
        sortValue: (m) => m.title.toLowerCase(),
        cell: (m) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{m.title}</span>
            {m.draftedByMarge && <Badge variant="info">Drafted by Marge</Badge>}
          </span>
        ),
      },
      {
        key: "company",
        header: "Company",
        sortValue: (m) => (m.company?.name ?? m.companyNamePending ?? "").toLowerCase(),
        mobile: "meta",
        cell: (m) =>
          m.company ? (
            m.company.name
          ) : m.companyNamePending ? (
            <span className="text-muted-foreground">Not in Molly yet: {m.companyNamePending}</span>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
      },
      {
        key: "status",
        header: "Status",
        sortValue: (m) => MEMO_STATUSES.indexOf(m.status),
        mobile: "badge",
        cell: (m) => <Badge variant={STATUS_VARIANT[m.status]}>{MEMO_STATUS_LABELS[m.status]}</Badge>,
      },
      {
        key: "decision",
        header: "Decision",
        sortValue: (m) => (m.decision ? MEMO_DECISIONS.indexOf(m.decision) : MEMO_DECISIONS.length),
        mobile: "meta",
        cell: (m) => (m.decision ? <Badge variant="neutral">{MEMO_DECISION_LABELS[m.decision]}</Badge> : <span className="text-muted-foreground">—</span>),
      },
      {
        key: "owner",
        header: "Owner",
        sortValue: (m) => ownerLabel(m.owner).toLowerCase(),
        mobile: "meta",
        cell: (m) => (m.owner.id === me ? "You" : ownerLabel(m.owner)),
      },
      {
        key: "visibility",
        header: "Visibility",
        sortValue: (m) => m.visibility,
        mobile: "meta",
        cell: (m) => <Badge variant={m.visibility === "TEAM" ? "info" : "neutral"}>{m.visibility === "TEAM" ? "Team" : "Private"}</Badge>,
      },
      {
        key: "updated",
        header: "Updated",
        sortValue: (m) => m.updatedAt,
        firstDir: "desc",
        mobile: "meta",
        cell: (m) => <span title={new Date(m.updatedAt).toLocaleString()}>{relativeTime(m.updatedAt)}</span>,
      },
    ],
    [me]
  );

  return (
    <AppShell>
      <PageHeader
        title="Memos"
        description="Investment memos. Private to you until you share them with the team."
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => router.push("/admin/memos/template")}>
              <Settings2 className="h-4 w-4" />
              Template
            </Button>
            <Button onClick={() => router.push("/admin/memos/new")}>
              <Plus className="h-4 w-4" />
              New memo
            </Button>
          </div>
        }
      />

      <TabBar tabs={TABS} active={scope} fallback="mine" label="Memo lists" />

      <DataTable<MemoRow>
        label="Memos"
        noun="memo"
        rows={rows}
        rowKey={(m) => m.id}
        columns={columns}
        rowHref={(m) => `/admin/memos/${m.id}`}
        defaultSort={{ key: "updated", dir: "desc" }}
        searchText={(m) => [m.title, m.company?.name, m.companyNamePending]}
        searchPlaceholder="Search memos"
        loading={loading}
        error={error}
        onRetry={load}
        minWidth={720}
        toolbarExtra={
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Company"
              className="input-field w-auto"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select aria-label="Status" className="input-field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              {MEMO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEMO_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select aria-label="Decision" className="input-field w-auto" value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="">Any decision</option>
              {MEMO_DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {MEMO_DECISION_LABELS[d]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={unlinked} onChange={(e) => setUnlinked(e.target.checked)} />
              Not linked to a company
            </label>
          </div>
        }
        empty={
          filtered ? (
            <EmptyState
              title="No memos match those filters"
              description="Try a different company, status or decision."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCompanyId("");
                    setStatus("");
                    setDecision("");
                    setUnlinked(false);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<NotebookText className="h-8 w-8" />}
              eyebrow="Memos"
              title={scope === "team" ? "Nothing shared with the team yet" : "No memos yet"}
              description="Start one from the house template, or ask Marge to draft it from your call notes."
              action={
                <Button onClick={() => router.push("/admin/memos/new")}>
                  <Plus className="h-4 w-4" />
                  New memo
                </Button>
              }
            />
          )
        }
      />
    </AppShell>
  );
}
