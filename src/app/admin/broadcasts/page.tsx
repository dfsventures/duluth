"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Megaphone, Plus, X, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ModalDialog as Modal } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useNewLook } from "@/lib/use-new-look";

interface Broadcast {
  id: string;
  subject: string;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  createdAt: string;
  targetCount: number;
  recipientCount: number;
  senderLabel: string | null;
}

interface PortfolioCompanyOption {
  id: string;
  name: string;
  contactCount: number;
}

// New look (WS169): one-line rows in the shared table. The old look keeps its boxes below.
const broadcastColumns: DataTableColumn<Broadcast>[] = [
  { key: "subject", header: "Subject", sortValue: (b) => b.subject || "Untitled", cell: (b) => b.subject || "Untitled" },
  {
    key: "status",
    header: "Status",
    sortValue: (b) => b.status,
    mobile: "badge",
    exportValue: (b) => (b.status === "PUBLISHED" ? "Sent" : "Draft"),
    title: (b) => (b.status === "PUBLISHED" ? "Sent" : "Draft"),
    cell: (b) => <Badge variant={b.status === "PUBLISHED" ? "success" : "warning"}>{b.status === "PUBLISHED" ? "Sent" : "Draft"}</Badge>,
  },
  { key: "companies", header: "Companies", align: "num", sortValue: (b) => b.targetCount, firstDir: "desc", mobile: "meta", cell: (b) => b.targetCount },
  {
    key: "recipients",
    header: "Recipients",
    align: "num",
    sortValue: (b) => (b.status === "PUBLISHED" ? b.recipientCount : null),
    firstDir: "desc",
    exportValue: (b) => (b.status === "PUBLISHED" ? b.recipientCount : ""),
    cell: (b) => (b.status === "PUBLISHED" ? b.recipientCount : ""),
  },
  {
    key: "sent",
    header: "Sent",
    sortValue: (b) => new Date(b.publishedAt ?? b.createdAt).getTime(),
    firstDir: "desc",
    className: "whitespace-nowrap text-muted-foreground",
    exportValue: (b) => (b.publishedAt ? formatDate(b.publishedAt) : ""),
    cell: (b) => (b.publishedAt ? formatDate(b.publishedAt) : "—"),
  },
  { key: "by", header: "By", sortValue: (b) => b.senderLabel, mobile: "meta", cell: (b) => b.senderLabel ?? "—" },
];

export default function AdminBroadcastsPage() {
  const newLook = useNewLook();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [companies, setCompanies] = useState<PortfolioCompanyOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newCompanyIds, setNewCompanyIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [broadcastsRes, companiesRes] = await Promise.all([
        fetch("/api/admin/broadcasts"),
        fetch("/api/admin/portfolio-companies"),
      ]);
      if (broadcastsRes.ok) setBroadcasts(await broadcastsRes.json());
      if (companiesRes.ok) setCompanies(await companiesRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNew() {
    setNewSubject("");
    setNewCompanyIds([]);
    setSaveError("");
    setShowNew(true);
  }

  function toggleCompany(id: string) {
    setNewCompanyIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: newSubject, portfolioCompanyIds: newCompanyIds }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? "Failed to create broadcast");
      }
      const broadcast = await res.json();
      window.location.href = `/admin/broadcasts/${broadcast.id}`;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const filteredBroadcasts = broadcasts.filter((b) =>
    (b.subject || "").toLowerCase().includes(search.trim().toLowerCase())
  );

  const confirm = useConfirm();
  async function handleDeleteDraft(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!(await confirm({ title: "Delete this draft broadcast", description: "This cannot be undone.", confirmLabel: "Delete draft" }))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/broadcasts/${id}`, { method: "DELETE" });
      if (res.ok) setBroadcasts((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell width="wide">
      <PageHeader
        title="Broadcasts"
        description="Email your portfolio companies — write a draft, choose who gets it, then send."
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            New Broadcast
          </Button>
        }
      />

      {newLook ? (
        <DataTable<Broadcast>
          label="Broadcasts"
          noun="broadcast"
          rows={broadcasts}
          rowKey={(b) => b.id}
          columns={broadcastColumns}
          rowHref={(b) => `/admin/broadcasts/${b.id}`}
          defaultSort={{ key: "sent", dir: "desc" }}
          searchText={(b) => [b.subject, b.senderLabel]}
          searchPlaceholder="Filter broadcasts"
          chips={[
            { key: "all", label: "All" },
            { key: "draft", label: "Draft", test: (b) => b.status === "DRAFT" },
            { key: "sent", label: "Sent", test: (b) => b.status === "PUBLISHED" },
          ]}
          loading={loading}
          minWidth={760}
          actionsLabel="Row actions"
          rowActions={(b) =>
            b.status === "DRAFT" ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete draft ${b.subject || "Untitled"}`}
                title="Delete draft"
                className="hover:text-tone-clay-ink"
                disabled={deletingId === b.id}
                onClick={(e) => handleDeleteDraft(e, b.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null
          }
          empty={<EmptyState eyebrow="Broadcasts" icon={<Megaphone className="h-8 w-8" />} title="No broadcasts yet" description="Write the first email to your portfolio companies." />}
        />
      ) : loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <EmptyState eyebrow="Broadcasts" icon={<Megaphone className="h-8 w-8" />} title="No broadcasts yet" description="Write the first email to your portfolio companies." />
      ) : (
        <>
          <div className="mb-6">
            <Input
              placeholder="Search by subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filteredBroadcasts.length === 0 ? (
            <EmptyState icon={<Megaphone className="h-8 w-8" />} title="No matches" description={search.trim() ? `Nothing matches "${search.trim()}".` : "Nothing matches the current search."} action={<Button variant="secondary" size="sm" onClick={() => setSearch("")}>Clear search</Button>} />
          ) : (
        <div className="space-y-2">
          {filteredBroadcasts.map((b) => (
            <Link
              key={b.id}
              href={`/admin/broadcasts/${b.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
            >
              <div className="min-w-48 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">{b.subject || "Untitled"}</span>
                  <Badge variant={b.status === "PUBLISHED" ? "success" : "warning"}>
                    {b.status === "PUBLISHED" ? "Sent" : "Draft"}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{b.targetCount} compan{b.targetCount === 1 ? "y" : "ies"}</span>
                  {b.status === "PUBLISHED" && <span>Sent to {b.recipientCount} contact{b.recipientCount === 1 ? "" : "s"}</span>}
                  {b.publishedAt && <span>{formatDate(b.publishedAt)}</span>}
                  {b.senderLabel && <span>{b.status === "PUBLISHED" ? "Sent by" : "By"} {b.senderLabel}</span>}
                </div>
              </div>
              {b.status === "DRAFT" && (
                <button
                  onClick={(e) => handleDeleteDraft(e, b.id)}
                  disabled={deletingId === b.id}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                  title="Delete draft"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </Link>
          ))}
        </div>
          )}
        </>
      )}

      {showNew && (
        <Modal title="New Broadcast" onClose={() => setShowNew(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              label="Subject *"
              required
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="e.g. A quick update from the DFS team"
            />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="label">Companies (you can change this later)</label>
                {companies.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setNewCompanyIds(companies.map((c) => c.id))}>
                      Select all
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNewCompanyIds([])}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>
              {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No portfolio companies yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                  {companies.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${
                        newCompanyIds.includes(c.id) ? "bg-primary/5" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={newCompanyIds.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="flex-1 min-w-0 text-sm font-medium">{c.name}</span>
                      <span className={`shrink-0 text-xs ${c.contactCount === 0 ? "text-tone-amber-ink" : "text-muted-foreground"}`}>
                        {c.contactCount} contact{c.contactCount === 1 ? "" : "s"}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {newCompanyIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{newCompanyIds.length} compan{newCompanyIds.length === 1 ? "y" : "ies"} selected</p>
              )}
            </div>
            {saveError && <p className="text-sm text-tone-clay-ink">{saveError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Draft"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
