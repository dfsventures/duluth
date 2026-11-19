"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Link2, Plus, Trash2, Eye, Copy, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { OpenParam, SplitView } from "@/components/layout/split-view";
import { DetailPane, PaneCard, PaneChip, PaneDetails, PaneSection } from "@/components/layout/detail-pane";
import { useNewLook } from "@/lib/use-new-look";
import { crumbLabel, stepCursor } from "@/lib/split-view";
import { TONE_CLASSES } from "@/lib/status-tone";
import { TableSkeleton } from "@/components/ui/skeleton";
import type { FilterChipDef } from "@/lib/data-table";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { useFlashMessage } from "@/lib/use-flash-message";
import { PageSkeleton } from "@/components/ui/skeleton";
import { EXPIRY_OPTIONS } from "@/lib/expiry-options";


interface PublishedUpdate {
  id: string;
  title: string;
  period: string;
  sentAt: string | null;
  company: { id: string; name: string };
}

interface LinkItem {
  id: string;
  token: string;
  label: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  expiresAt: string | null;
  createdAt: string;
  companies: { company: { id: string; name: string } }[];
  _count: { views: number };
}

interface ViewLog {
  id: string;
  email: string;
  viewedAt: string;
}

function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return "Never expires";
  const d = new Date(expiresAt);
  if (d < new Date()) return "Expired";
  return `Expires ${formatDate(expiresAt)}`;
}

function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

// New look: the pane's view log, read from the same GET /api/links/:id the old inline log uses.
function LinkViews({ id, onError }: { id: string; onError: () => void }) {
  const [views, setViews] = useState<ViewLog[] | null>(null);
  useEffect(() => {
    let live = true;
    setViews(null);
    fetch(`/api/links/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (live) setViews(data.views ?? []);
      })
      .catch(() => {
        if (live) {
          setViews([]);
          onError();
        }
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (views === null) return <p>Loading…</p>;
  if (views.length === 0) return <p>No views yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {views.map((v) => (
        <li key={v.id} className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0 truncate text-foreground">{v.email}</span>
          <span className="flex-none text-muted-foreground">{new Date(v.viewedAt).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminLinksPage() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [publishedUpdates, setPublishedUpdates] = useState<PublishedUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setMessage] = useFlashMessage();

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(30);
  const [selectedUpdateIds, setSelectedUpdateIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Bulk LP report link (WS12): select-all-in-range + optional period-scoped metrics
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [limitMetricsToPeriod, setLimitMetricsToPeriod] = useState(false);

  const [expandedViews, setExpandedViews] = useState<string | null>(null);
  const [viewLogs, setViewLogs] = useState<Record<string, ViewLog[]>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const newLook = useNewLook();
  const [visibleRows, setVisibleRows] = useState<LinkItem[]>([]);
  const visibleKeys = useMemo(() => visibleRows.map((l) => l.id), [visibleRows]);

  const loadData = useCallback(async () => {
    try {
      const [linksRes, updatesRes] = await Promise.all([
        fetch("/api/links"),
        fetch("/api/admin/updates"),
      ]);
      if (!linksRes.ok) throw new Error("Failed to load links");
      const [linksData, updatesData] = await Promise.all([
        linksRes.json(),
        updatesRes.json(),
      ]);
      setLinks(linksData);
      setPublishedUpdates(updatesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function toggleUpdate(id: string) {
    setSelectedUpdateIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  }

  function selectAllInRange() {
    if (!bulkFrom || !bulkTo) return;
    const from = new Date(`${bulkFrom}T00:00:00Z`);
    const to = new Date(`${bulkTo}T23:59:59.999Z`);
    const inRange = publishedUpdates.filter((u) => {
      if (!u.sentAt) return false;
      const sentAt = new Date(u.sentAt);
      return sentAt >= from && sentAt <= to;
    });
    setSelectedUpdateIds(inRange.map((u) => u.id));
    setLimitMetricsToPeriod(true);
  }

  function clearSelection() {
    setSelectedUpdateIds([]);
    setLimitMetricsToPeriod(false);
  }

  const selectedCompanyCount = new Set(
    publishedUpdates.filter((u) => selectedUpdateIds.includes(u.id)).map((u) => u.company.id)
  ).size;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (selectedUpdateIds.length === 0) {
      setMessage({ type: "error", text: "Select at least one update." });
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const expiresAt = expiryDays
        ? new Date(Date.now() + expiryDays * 86400000).toISOString()
        : null;

      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || null,
          updateIds: selectedUpdateIds,
          expiresAt,
          metricScope: limitMetricsToPeriod ? "PERIOD" : "ALL_TIME",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to create link");
      }

      setLabel("");
      setExpiryDays(30);
      setSelectedUpdateIds([]);
      setBulkFrom("");
      setBulkTo("");
      setLimitMetricsToPeriod(false);
      setShowForm(false);
      setMessage({ type: "success", text: "Investor link created." });
      await loadData();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to create" });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/links/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setConfirmDeleteId(null);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      setMessage({ type: "success", text: "Link revoked." });
    } catch {
      setMessage({ type: "error", text: "Failed to revoke link." });
    } finally {
      setDeleting(false);
    }
  }

  async function loadViews(linkId: string) {
    if (expandedViews === linkId) { setExpandedViews(null); return; }
    try {
      const res = await fetch(`/api/links/${linkId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setViewLogs((prev) => ({ ...prev, [linkId]: data.views ?? [] }));
      setExpandedViews(linkId);
    } catch {
      setMessage({ type: "error", text: "Failed to load view log." });
    }
  }

  function copyLink(token: string, id: string) {
    navigator.clipboard.writeText(shareUrl(token));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filteredLinks = links.filter((link) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    if ((link.label ?? "").toLowerCase().includes(term)) return true;
    return link.companies.some((c) => c.company.name.toLowerCase().includes(term));
  });

  // Group updates by company for display in the picker
  const updatesByCompany = publishedUpdates.reduce<Record<string, { company: PublishedUpdate["company"]; updates: PublishedUpdate[] }>>(
    (acc, u) => {
      if (!acc[u.company.id]) acc[u.company.id] = { company: u.company, updates: [] };
      acc[u.company.id].updates.push(u);
      return acc;
    },
    {}
  );

  if (loading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  function renderLinkPane(
    link: LinkItem,
    nav: { crumb: string; onPrev?: () => void; onNext?: () => void; onClose: () => void }
  ) {
    const expired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
    return (
      <DetailPane
        crumb={nav.crumb}
        title={link.label || "Untitled link"}
        mark={<Link2 className="h-5 w-5 flex-none text-muted-foreground" aria-hidden="true" />}
        onPrev={nav.onPrev}
        onNext={nav.onNext}
        onClose={nav.onClose}
        chips={
          <>
            {link.companies.map((c) => (
              <PaneChip key={c.company.id} className={TONE_CLASSES.sky.chip}>
                {c.company.name}
              </PaneChip>
            ))}
            <PaneChip className={expired ? TONE_CLASSES.stone.chip : undefined}>{expiryLabel(link.expiresAt)}</PaneChip>
          </>
        }
        card={
          <PaneCard
            heading={copiedId === link.id ? "Link copied" : "Share this link"}
            actions={
              confirmDeleteId === link.id ? (
                <>
                  <span className="text-body text-secondary">Revoke this link?</span>
                  <Button variant="destructive" disabled={deleting} onClick={() => handleDelete(link.id)}>
                    {deleting ? "..." : "Confirm"}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button onClick={() => copyLink(link.token, link.id)}>
                    {copiedId === link.id ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedId === link.id ? "Copied" : "Copy link"}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmDeleteId(link.id)}>
                    Revoke
                  </Button>
                </>
              )
            }
          >
            Anyone with this link can read the included updates. Revoking it stops access for good.
          </PaneCard>
        }
      >
        <PaneSection title="Views">
          <LinkViews id={link.id} onError={() => setMessage({ type: "error", text: "Failed to load view log." })} />
        </PaneSection>
        <PaneSection title="Details">
          <PaneDetails
            rows={[
              { label: "Created", value: formatDate(link.createdAt) },
              { label: "Expires", value: link.expiresAt ? formatDate(link.expiresAt) : "Never" },
              { label: "Views", value: link._count.views },
            ]}
          />
        </PaneSection>
      </DetailPane>
    );
  }

  const linkColumns: DataTableColumn<LinkItem>[] = [
    {
      key: "label",
      header: "Label",
      sortValue: (l) => l.label ?? "Untitled link",
      cell: (l) => <span className="min-w-0 truncate">{l.label || "Untitled link"}</span>,
    },
    {
      key: "companies",
      header: "Companies",
      mobile: "meta",
      sortValue: (l) => l.companies.map((c) => c.company.name).join(", "),
      title: (l) => l.companies.map((c) => c.company.name).join(", "),
      cell: (l) => <span className="min-w-0 truncate text-muted-foreground">{l.companies.map((c) => c.company.name).join(", ") || "—"}</span>,
    },
    {
      key: "expires",
      header: "Expires",
      dropBelow: 600,
      mobile: "meta",
      sortValue: (l) => (l.expiresAt ? new Date(l.expiresAt).getTime() : Number.MAX_SAFE_INTEGER),
      cell: (l) => (l.expiresAt ? (new Date(l.expiresAt) < new Date() ? "Expired" : formatDate(l.expiresAt)) : "Never"),
    },
    {
      key: "views",
      header: "Views",
      align: "num",
      dropBelow: 480,
      sortValue: (l) => l._count.views,
      cell: (l) => l._count.views,
    },
    {
      key: "created",
      header: "Created",
      align: "num",
      firstDir: "desc",
      mobile: "meta",
      sortValue: (l) => new Date(l.createdAt).getTime(),
      cell: (l) => formatDate(l.createdAt),
    },
  ];
  const linkChips: FilterChipDef<LinkItem>[] = [
    { key: "active", label: "Active", test: (l) => !l.expiresAt || new Date(l.expiresAt) >= new Date() },
    { key: "expired", label: "Expired", test: (l) => !!l.expiresAt && new Date(l.expiresAt) < new Date() },
  ];

  return (
    <AppShell width={newLook ? "full" : undefined}>
      <PageHeader
        title="Investor Links"
        description="Generate read-only shareable links for LPs across portfolio companies."
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            New Link
          </Button>
        }
      />


      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-tone-clay-ink v2:mx-[var(--row-pad)] v2:mb-0 v2:mt-4 v2:border-transparent v2:bg-tone-clay">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <Card className="mb-6 v2:mx-[var(--row-pad)] v2:max-w-[720px] v2:border-0 v2:bg-transparent v2:p-0 v2:pb-6 v2:shadow-none">
          <CardHeader><CardTitle className="text-base v2:font-sans v2:text-row v2:font-medium">New Investor Link</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                id="label"
                label="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Q1 2025 LP Update"
              />

              {publishedUpdates.length > 0 && (
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <label className="label">Bulk select by period (LP report link)</label>
                  <div className="flex flex-wrap items-end gap-3">
                    <Input
                      id="bulk-from"
                      label="From"
                      type="date"
                      value={bulkFrom}
                      onChange={(e) => setBulkFrom(e.target.value)}
                    />
                    <Input
                      id="bulk-to"
                      label="To"
                      type="date"
                      value={bulkTo}
                      onChange={(e) => setBulkTo(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!bulkFrom || !bulkTo}
                      onClick={selectAllInRange}
                    >
                      Select all in range
                    </Button>
                    {selectedUpdateIds.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                        Clear selection
                      </Button>
                    )}
                  </div>
                  {selectedUpdateIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedUpdateIds.length} update{selectedUpdateIds.length !== 1 ? "s" : ""} across{" "}
                      {selectedCompanyCount} compan{selectedCompanyCount !== 1 ? "ies" : "y"}.
                    </p>
                  )}
                  <label className="flex items-center gap-2 pt-1 text-sm">
                    <input
                      type="checkbox"
                      checked={limitMetricsToPeriod}
                      onChange={(e) => setLimitMetricsToPeriod(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    Limit the metric summary to this period
                  </label>
                </div>
              )}

              <div className="space-y-2">
                <label className="label">Updates to include</label>
                {publishedUpdates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No published updates yet.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                    {Object.values(updatesByCompany).map(({ company, updates }) => (
                      <div key={company.id}>
                        <div className="px-3 py-1.5 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {company.name}
                        </div>
                        {updates.map((u) => (
                          <label
                            key={u.id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${
                              selectedUpdateIds.includes(u.id) ? "bg-primary/5" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedUpdateIds.includes(u.id)}
                              onChange={() => toggleUpdate(u.id)}
                              className="h-4 w-4 rounded border-border accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">{u.title}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{u.period}</span>
                            </div>
                            {u.sentAt && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {new Date(u.sentAt).toLocaleDateString()}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {selectedUpdateIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedUpdateIds.length} update{selectedUpdateIds.length !== 1 ? "s" : ""} selected</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="label">Link Expiry</label>
                <div className="flex flex-wrap gap-2">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setExpiryDays(opt.days)}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        expiryDays === opt.days
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={creating || selectedUpdateIds.length === 0}>
                  {creating ? "Creating..." : "Create Link"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setSelectedUpdateIds([]);
                    setBulkFrom("");
                    setBulkTo("");
                    setLimitMetricsToPeriod(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {links.length === 0 ? (
        <EmptyState className="v2:mx-[var(--row-pad)] v2:py-3" eyebrow="Investor Links"
          icon={<Link2 className="h-10 w-10" />}
          title="No investor links yet"
          description="Create a shareable link to give LPs read-only access to portfolio updates and metrics."
          action={<Button size="sm" onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />New Link</Button>}
        />
      ) : newLook ? (
        <OpenParam fallback={<TableSkeleton rows={4} cols={4} />}>
          {(openId, setOpenId) => {
            const closePane = () => setOpenId(null);
            const step = (delta: 1 | -1) => {
              const to = stepCursor(visibleKeys, openId, delta);
              if (to) setOpenId(to);
            };
            const openLink = openId ? (links.find((l) => l.id === openId) ?? null) : null;
            const at = openLink ? visibleKeys.indexOf(openLink.id) : -1;
            return (
              <SplitView
                open={openId}
                onClose={closePane}
                paneLabel={openLink?.label || "Untitled link"}
                pane={
                  openLink
                    ? renderLinkPane(openLink, {
                        crumb: crumbLabel("Investor Links", visibleKeys, openLink.id),
                        onPrev: at > 0 ? () => step(-1) : undefined,
                        onNext: at !== -1 && at < visibleKeys.length - 1 ? () => step(1) : undefined,
                        onClose: closePane,
                      })
                    : null
                }
                list={
                  <DataTable<LinkItem>
                    label="Investor links"
                    noun="link"
                    rows={links}
                    rowKey={(l) => l.id}
                    columns={linkColumns}
                    onOpenRow={(l) => setOpenId(l.id)}
                    openKey={openId}
                    onVisibleRowsChange={setVisibleRows}
                    rowClassName={(l) => (l.expiresAt && new Date(l.expiresAt) < new Date() ? "text-muted-foreground" : undefined)}
                    defaultSort={{ key: "created", dir: "desc" }}
                    searchText={(l) => [l.label, ...l.companies.map((c) => c.company.name)]}
                    searchPlaceholder="Filter links"
                    chips={linkChips}
                    empty={null}
                  />
                }
              />
            );
          }}
        </OpenParam>
      ) : (
        <>
          <div className="mb-6">
            <Input
              placeholder="Search by label or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filteredLinks.length === 0 ? (
            <EmptyState icon={<Link2 className="h-10 w-10" />} title="No matches" description={search.trim() ? `Nothing matches "${search.trim()}".` : "Nothing matches the current search."} action={<Button variant="secondary" size="sm" onClick={() => setSearch("")}>Clear search</Button>} />
          ) : (
        <div className="space-y-4">
          {filteredLinks.map((link) => {
            const expired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
            return (
              <Card key={link.id} className={expired ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-48 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="font-medium">{link.label || "Untitled link"}</p>
                        {expired && <Badge variant="neutral">Expired</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {link.companies.map((c) => (
                          <Badge key={c.company.id} variant="info" className="text-xs">
                            {c.company.name}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {expiryLabel(link.expiresAt)}
                        {" · "}
                        Created {formatDate(link.createdAt)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => loadViews(link.id)}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        {link._count.views} {link._count.views === 1 ? "view" : "views"}
                        {expandedViews === link.id ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
                      </Button>

                      <Button variant="secondary" size="sm" onClick={() => copyLink(link.token, link.id)}>
                        {copiedId === link.id ? (
                          <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-tone-sage-ink" />Copied</>
                        ) : (
                          <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy Link</>
                        )}
                      </Button>

                      {confirmDeleteId === link.id ? (
                        <>
                          <span className="text-sm text-muted-foreground">Revoke?</span>
                          <Button variant="destructive" size="sm" disabled={deleting} onClick={() => handleDelete(link.id)}>
                            {deleting ? "..." : "Confirm"}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(link.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* View log */}
                  {expandedViews === link.id && (
                    <div className="mt-4 rounded-md border bg-muted/30 p-3">
                      {!viewLogs[link.id] || viewLogs[link.id].length === 0 ? (
                        <p className="text-xs text-muted-foreground">No views yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">View history</p>
                          {viewLogs[link.id].map((v) => (
                            <div key={v.id} className="flex items-center justify-between text-xs">
                              <span className="font-medium">{v.email}</span>
                              <span className="text-muted-foreground">
                                {new Date(v.viewedAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
          )}
        </>
      )}
    </AppShell>
  );
}
