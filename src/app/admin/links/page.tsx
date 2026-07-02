"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Link2,
  Plus,
  Trash2,
  Eye,
  Copy,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Never", days: null },
];

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

export default function AdminLinksPage() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [publishedUpdates, setPublishedUpdates] = useState<PublishedUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(30);
  const [selectedUpdateIds, setSelectedUpdateIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [expandedViews, setExpandedViews] = useState<string | null>(null);
  const [viewLogs, setViewLogs] = useState<Record<string, ViewLog[]>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to create link");
      }

      setLabel("");
      setExpiryDays(30);
      setSelectedUpdateIds([]);
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
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
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

      {message && (
        <div className={`mb-6 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${
          message.type === "success" ? "border-acacia/30 bg-acacia/10 text-acacia" : "border-laterite/30 bg-laterite/10 text-laterite"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}><X className="h-4 w-4 opacity-50 hover:opacity-100" /></button>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-laterite/30 bg-laterite/10 px-4 py-3 text-sm text-laterite">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">New Investor Link</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                id="label"
                label="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Q1 2025 LP Update"
              />

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
                          : "border-border bg-white text-muted-foreground hover:border-primary hover:text-foreground"
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
                <Button type="button" variant="secondary" size="sm" onClick={() => { setShowForm(false); setSelectedUpdateIds([]); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {links.length === 0 ? (
        <EmptyState
          icon={<Link2 className="h-10 w-10" />}
          title="No investor links yet"
          description="Create a shareable link to give LPs read-only access to portfolio updates and metrics."
          action={<Button size="sm" onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />New Link</Button>}
        />
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const expired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
            return (
              <Card key={link.id} className={expired ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
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
                          <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-acacia" />Copied</>
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
    </AppShell>
  );
}
