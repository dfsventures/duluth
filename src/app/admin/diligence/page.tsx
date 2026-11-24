"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, type DataTableColumn, type DataTableGroupBy } from "@/components/ui/data-table";
import { OpenParam, SplitView } from "@/components/layout/split-view";
import { DetailPane, PaneCard, PaneChip, PaneDetails, PaneSection } from "@/components/layout/detail-pane";
import { NameTile } from "@/components/ui/name-tile";
import { crumbLabel, stepCursor } from "@/lib/split-view";
import { TONE_CLASSES } from "@/lib/status-tone";
import { TableSkeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { AlertCircle, Inbox } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { noticeClasses } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { DD_DOC_TYPES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import DiligenceAnswers from "@/components/admin/diligence-answers";
import { PageSkeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";

// Part 16, WS41 (Q54, JC-DD-G) — admin DD review queue. Its own page,
// not a third section on /admin/approvals: this reviews Company/
// CompanyDiligence rows (documents + questionnaire), not User rows
// (a yes/no on a person). The "Decline" action reuses the existing
// generic DELETE /api/companies/[id] confirm copy for now — WS43 swaps
// in DD-specific wording once this page exists to host it.

interface DiligenceItem {
  id: string;
  name: string;
  createdAt: string;
  founder: { name: string | null; email: string } | null;
  diligence: {
    isUsIncorporated: boolean | null;
    isStellarEcosystem: boolean;
    stellarWhyText: string | null;
    stellarTimelineText: string | null;
    completedAt: string | null;
  } | null;
  documentCounts: Record<string, number>;
  progress: { done: number; total: number };
}

// Two groups under sticky headings, "Ready for review" first.
const DD_GROUP_BY: DataTableGroupBy<DiligenceItem> = {
  fixed: "stage",
  options: [
    {
      key: "stage",
      label: "Stage",
      getGroup: (i) =>
        i.diligence?.completedAt
          ? { id: "ready", label: "Ready for review" }
          : { id: "awaiting", label: "Awaiting founder" },
    },
  ],
};

export default function AdminDiligencePage() {
  const [visibleRows, setVisibleRows] = useState<DiligenceItem[]>([]);
  const visibleKeys = useMemo(() => visibleRows.map((i) => i.id), [visibleRows]);
  const [items, setItems] = useState<DiligenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const [actionStates, setActionStates] = useState<
    Record<string, { loading: boolean; error?: string }>
  >({});
  // F35 (2026-08-03 audit) — the decline confirm copy says the founder's
  // account is always removed; it isn't when they still have a dangling
  // dependency (e.g. a ShareableLink still serving another company). The
  // DELETE response now reports that via founderAccountsRetained, and we
  // surface it here instead of letting the confirm dialog's claim go
  // unchecked.
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/diligence");
      if (!res.ok) throw new Error("Failed to load the diligence queue");
      setItems(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePromote(id: string) {
    setActionStates((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/admin/diligence/${id}/promote`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to promote");
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setActionStates((prev) => ({
        ...prev,
        [id]: { loading: false, error: err instanceof Error ? err.message : "Failed to promote" },
      }));
    }
  }

  async function askDecline(item: DiligenceItem) {
    const ok = await confirm({
      title: `Delete ${item.name}`,
      description: `This deal didn't close. Deleting will permanently remove ${item.name}${
        item.founder ? ` and ${item.founder.name ?? item.founder.email}'s account` : ""
      } from Molly. This cannot be undone.`,
      confirmLabel: "Delete company",
      typeToConfirm: item.name,
    });
    if (ok) await handleDecline(item.id);
  }

  async function handleDecline(id: string) {
    setActionStates((prev) => ({ ...prev, [id]: { loading: true } }));
    setNotice(null);
    try {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to decline");
      }
      const declined = items.find((item) => item.id === id);
      if (Array.isArray(data?.founderAccountsRetained) && data.founderAccountsRetained.length > 0) {
        setNotice(
          `${declined?.name ?? "The company"} was deleted. ${data.founderAccountsRetained.join(", ")}'s account could not be automatically removed — it still has other data attached (e.g. an investor link they created) and needs manual cleanup.`
        );
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setActionStates((prev) => ({
        ...prev,
        [id]: { loading: false, error: err instanceof Error ? err.message : "Failed to decline" },
      }));
    }
  }

  if (loading) {
    return (
      <AppShell width="full">
        <PageSkeleton />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell width="full">
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </AppShell>
    );
  }

  const awaitingFounder = items.filter((i) => !i.diligence?.completedAt);
  const readyForReview = items.filter((i) => i.diligence?.completedAt);

  // The pane for one item.
  function renderPane(
    item: DiligenceItem,
    ready: boolean,
    nav: { crumb: string; onPrev?: () => void; onNext?: () => void; onClose: () => void }
  ) {
    const state = actionStates[item.id];
    const d = item.diligence;
    return (
      <DetailPane
        crumb={nav.crumb}
        title={item.name}
        mark={<NameTile name={item.name} kind="company" className="mr-0 v2:h-8 v2:w-8 v2:text-[13px]" />}
        onPrev={nav.onPrev}
        onNext={nav.onNext}
        onClose={nav.onClose}
        chips={
          <>
            <PaneChip>
              {item.founder ? (item.founder.name ? `${item.founder.name} · ${item.founder.email}` : item.founder.email) : "No founder assigned"}
            </PaneChip>
            <PaneChip className={d?.isUsIncorporated == null ? undefined : TONE_CLASSES.sky.chip}>
              {d?.isUsIncorporated == null
                ? "Incorporation: unanswered"
                : d.isUsIncorporated
                  ? "US-incorporated"
                  : "Not US-incorporated"}
            </PaneChip>
            {d?.isStellarEcosystem && (
              <PaneChip className={d.stellarWhyText && d.stellarTimelineText ? TONE_CLASSES.sky.chip : TONE_CLASSES.amber.chip}>
                Stellar essays {d.stellarWhyText && d.stellarTimelineText ? "present" : "missing"}
              </PaneChip>
            )}
            {DD_DOC_TYPES.map((docType) => (
              <PaneChip key={docType.value}>
                {docType.label}: {item.documentCounts[docType.value] ?? 0}
              </PaneChip>
            ))}
          </>
        }
        card={
          <PaneCard
            heading={ready ? `Promote ${item.name}` : `Waiting on ${item.founder?.name ?? "the founder"}`}
            actions={
              <>
                {ready && (
                  <Button disabled={state?.loading} onClick={() => handlePromote(item.id)}>
                    {state?.loading ? "..." : "Promote"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="text-tone-clay-ink"
                  disabled={state?.loading}
                  onClick={() => askDecline(item)}
                >
                  Decline
                </Button>
              </>
            }
          >
            {state?.error && (
              <span role="alert" className="mb-2 block text-meta text-destructive">
                {state.error}
              </span>
            )}
            {item.progress.done} of {item.progress.total} required items done.{" "}
            {ready ? "Promote moves it into the portfolio." : "It moves to Ready for review once the founder finishes."}
          </PaneCard>
        }
      >
        <PaneSection title="Company">
          <Link href={`/admin/companies/${item.id}?tab=diligence`} className="text-primary hover:underline">
            Open company →
          </Link>
        </PaneSection>
        {d?.isStellarEcosystem && (
          <PaneSection title="Questionnaire answers">
            <div className="space-y-3">
              <DiligenceAnswers diligence={d} variant="compact" />
            </div>
          </PaneSection>
        )}
        <PaneSection title="Details">
          <PaneDetails
            rows={[
              { label: "Created", value: formatDate(item.createdAt) },
              { label: "Progress", value: `${item.progress.done} of ${item.progress.total}` },
            ]}
          />
        </PaneSection>
      </DetailPane>
    );
  }

  const diligenceRows = [...readyForReview, ...awaitingFounder];
  const isReady = (i: DiligenceItem) => Boolean(i.diligence?.completedAt);
  const diligenceColumns: DataTableColumn<DiligenceItem>[] = [
    {
      key: "company",
      header: "Company",
      sortValue: (i) => i.name,
      cell: (i) => (
        <>
          <NameTile name={i.name} kind="company" className="v2:mr-3 v2:h-5 v2:w-5 v2:text-[10px]" />
          <span className="min-w-0 truncate" title={i.name}>
            {i.name}
          </span>
        </>
      ),
    },
    {
      key: "founder",
      header: "Founder",
      dropBelow: 480,
      mobile: "meta",
      sortValue: (i) => i.founder?.name ?? i.founder?.email,
      cell: (i) => i.founder?.name ?? i.founder?.email ?? <span className="text-muted-foreground">No founder assigned</span>,
    },
    {
      key: "progress",
      header: "Progress",
      align: "num",
      mobile: "meta",
      // Ready rows first (so the "Ready for review" group leads), then the ones nearest done.
      sortValue: (i) => (isReady(i) ? 0 : 1000) + (i.progress.total - i.progress.done),
      cell: (i) => `${i.progress.done} of ${i.progress.total}`,
    },
    {
      key: "created",
      header: "Created",
      align: "num",
      dropBelow: 600,
      firstDir: "desc",
      sortValue: (i) => new Date(i.createdAt).getTime(),
      cell: (i) => formatDate(i.createdAt),
    },
  ];

  return (
    <AppShell width="full">
      <PageHeader
        title="Due Diligence"
        description="Companies invited for due diligence, awaiting paperwork before they join the portfolio."
      />

      {notice && (
        <div className={noticeClasses("amber", "mb-6 flex items-start gap-2 v2:mx-[var(--row-pad)] v2:mb-0 v2:mt-4")}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-tone-amber-ink" />
          <span>{notice}</span>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState className="v2:mx-[var(--row-pad)]" eyebrow="Diligence"
          icon={<Inbox className="h-10 w-10" />}
          title="No companies in due diligence"
          description="Nothing is waiting on you right now. Turn on due diligence when you add a company to route it into this queue."
        />
      ) : (
        <OpenParam fallback={<TableSkeleton rows={4} cols={4} />}>
          {(openId, setOpenId) => {
            const closePane = () => setOpenId(null);
            const step = (delta: 1 | -1) => {
              const to = stepCursor(visibleKeys, openId, delta);
              if (to) setOpenId(to);
            };
            const openItem = openId ? (items.find((i) => i.id === openId) ?? null) : null;
            const at = openItem ? visibleKeys.indexOf(openItem.id) : -1;
            return (
              <SplitView
                open={openId}
                onClose={closePane}
                paneLabel={openItem?.name}
                pane={
                  openItem
                    ? renderPane(openItem, isReady(openItem), {
                        crumb: crumbLabel("Due Diligence", visibleKeys, openItem.id),
                        onPrev: at > 0 ? () => step(-1) : undefined,
                        onNext: at !== -1 && at < visibleKeys.length - 1 ? () => step(1) : undefined,
                        onClose: closePane,
                      })
                    : null
                }
                list={
                  <DataTable<DiligenceItem>
                    label="Companies in due diligence"
                    noun="company"
                    pluralNoun="companies"
                    rows={diligenceRows}
                    rowKey={(i) => i.id}
                    columns={diligenceColumns}
                    onOpenRow={(i) => setOpenId(i.id)}
                    openKey={openId}
                    onVisibleRowsChange={setVisibleRows}
                    defaultSort={{ key: "progress", dir: "asc" }}
                    groupBy={DD_GROUP_BY}
                    searchText={(i) => [i.name, i.founder?.name, i.founder?.email]}
                    searchPlaceholder="Filter companies"
                    empty={null}
                  />
                }
              />
            );
          }}
        </OpenParam>
      )}
    </AppShell>
  );
}
