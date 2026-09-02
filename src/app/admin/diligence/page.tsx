"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Inbox,
  UserPlus,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DD_DOC_TYPES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

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

export default function AdminDiligencePage() {
  const [items, setItems] = useState<DiligenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeclineId, setConfirmDeclineId] = useState<string | null>(null);
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
      setConfirmDeclineId(null);
    } catch (err) {
      setActionStates((prev) => ({
        ...prev,
        [id]: { loading: false, error: err instanceof Error ? err.message : "Failed to decline" },
      }));
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
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

  function ItemCard({ item, ready }: { item: DiligenceItem; ready: boolean }) {
    const state = actionStates[item.id];
    const confirming = confirmDeclineId === item.id;

    return (
      <Card>
        <CardContent className="flex flex-wrap items-start gap-3 py-4">
          <div className="min-w-48 flex-1">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <p className="font-medium">{item.name}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.founder ? (item.founder.name ? `${item.founder.name} · ${item.founder.email}` : item.founder.email) : "No founder assigned"}
            </p>
            <p className="text-xs text-muted-foreground">Created {formatDate(item.createdAt)}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={item.diligence?.isUsIncorporated == null ? "neutral" : "info"}>
                {item.diligence?.isUsIncorporated == null
                  ? "Incorporation: unanswered"
                  : item.diligence.isUsIncorporated
                    ? "US-incorporated"
                    : "Not US-incorporated"}
              </Badge>
              {item.diligence?.isStellarEcosystem && (
                <Badge variant={item.diligence.stellarWhyText && item.diligence.stellarTimelineText ? "info" : "warning"}>
                  Stellar essays {item.diligence.stellarWhyText && item.diligence.stellarTimelineText ? "present" : "missing"}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {item.progress.done} of {item.progress.total} required items done
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {DD_DOC_TYPES.map((docType) => (
                <span key={docType.value} className="rounded-sm border border-bone px-1.5 py-0.5">
                  {docType.label}: {item.documentCounts[docType.value] ?? 0}
                </span>
              ))}
            </div>

            {state?.error && <p className="mt-2 text-xs text-destructive">{state.error}</p>}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {confirming ? (
              <>
                {/* Part 16, WS43 (Q57, corrected) — every company on this
                    page is DILIGENCE-stage, and DELETE now really does
                    remove the founder's account too (when they have no
                    other company), so this copy states that plainly —
                    unlike admin/companies/[id]'s generic delete confirm,
                    which is untouched and still company-only. */}
                <span className="max-w-xs text-sm text-muted-foreground">
                  This deal didn&apos;t close. Deleting will permanently remove {item.name}
                  {item.founder ? ` and ${item.founder.name ?? item.founder.email}'s account` : ""} from
                  Molly — this cannot be undone.
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={state?.loading}
                  onClick={() => handleDecline(item.id)}
                >
                  {state?.loading ? "..." : "Confirm Delete"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={state?.loading}
                  onClick={() => setConfirmDeclineId(null)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={state?.loading}
                  onClick={() => setConfirmDeclineId(item.id)}
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" />
                  Decline
                </Button>
                {ready && (
                  <Button size="sm" disabled={state?.loading} onClick={() => handlePromote(item.id)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    {state?.loading ? "..." : "Promote"}
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Due Diligence"
        description="Companies invited for due diligence, awaiting paperwork before they join the portfolio."
      />

      {notice && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-ochre/30 bg-ochre/10 px-4 py-3 text-sm text-ochre">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title="No companies in due diligence"
          description="Nothing is waiting on you right now. Turn on due diligence when you add a company to route it into this queue."
        />
      ) : (
        <div className="space-y-6">
          {readyForReview.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <ClipboardCheck className="h-4 w-4" />
                Ready for review ({readyForReview.length})
              </h2>
              <div className="space-y-3">
                {readyForReview.map((item) => (
                  <ItemCard key={item.id} item={item} ready />
                ))}
              </div>
            </div>
          )}

          {awaitingFounder.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock className="h-4 w-4" />
                Awaiting founder ({awaitingFounder.length})
              </h2>
              <div className="space-y-3">
                {awaitingFounder.map((item) => (
                  <ItemCard key={item.id} item={item} ready={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
