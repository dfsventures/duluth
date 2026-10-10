"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Inbox,
  UserPlus,
  Clock,
  Send,
  EyeOff,
  Eye,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import { addPortcoContact } from "@/lib/portco-link-contact";
import { PageSkeleton } from "@/components/ui/skeleton";
import { mutate as globalMutate } from "swr";
import { NAV_COUNTS_KEY } from "@/lib/fetcher";
import { useRowCollapse } from "@/lib/use-row-collapse";

// WS48 — awaiting-setup rows this stale (past their own token's expiry)
// auto-group with dismissed rows. Deliberately longer than the 7-day
// SETUP_TOKEN_TTL_DAYS so a resend (which refreshes tokenExpiresAt) always
// pulls a row back out with no extra bookkeeping. Kept local rather than in
// setup-token.ts (JC-AQ-D) since that file imports the Node `crypto` module.
const STALE_AFTER_DAYS = 30;

// Part 31, WS77 — reason copy for the suggestion block. Kept local to
// this page (the only consumer of PortcoMatch.reasons as UI copy).
const REASON_COPY: Record<string, string> = {
  CONTACT_EMAIL: "matched by contact email",
  NAME_EXACT: "matched by company name",
  ALIAS_EXACT: "matched by company alias",
  EMAIL_DOMAIN: "matched by shared email domain",
  NAME_TOKENS: "matched by similar name",
};

interface Approval {
  id: string;
  name: string;
  email: string;
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
}

interface PortcoMatch {
  portfolioCompanyId: string;
  portfolioCompanyName: string;
  tier: "STRONG" | "MEDIUM" | "WEAK";
  reasons: string[];
  alreadyLinked: boolean;
  signupEmailIsAlreadyContact: boolean;
}

interface AwaitingUser {
  id: string;
  email: string;
  name: string | null;
  status: string;
  roles: string[];
  tokenExpiresAt: string | null;
  createdAt: string;
  setupQueueDismissedAt: string | null;
  memberships: { company: { id: string; name: string; createdById: string } }[];
}

function isStale(u: AwaitingUser): boolean {
  return (
    !u.tokenExpiresAt ||
    new Date(u.tokenExpiresAt).getTime() + STALE_AFTER_DAYS * 86400000 < Date.now()
  );
}

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<
    Record<string, { loading: boolean; result?: "approved" | "rejected"; error?: string }>
  >({});

  const [awaitingUsers, setAwaitingUsers] = useState<AwaitingUser[]>([]);
  const [awaitingLoading, setAwaitingLoading] = useState(true);
  const [resendStates, setResendStates] = useState<
    Record<string, { loading: boolean; result?: "sent"; error?: string }>
  >({});
  const [dismissStates, setDismissStates] = useState<
    Record<string, { loading: boolean; error?: string }>
  >({});
  const confirm = useConfirm();
  const rowCollapse = useRowCollapse();
  const [deleteStates, setDeleteStates] = useState<
    Record<string, { loading: boolean; error?: string }>
  >({});

  // Part 31, WS77 — per-approval portfolio-company suggestion state.
  // matchStates holds the full ranked list (STRONG/MEDIUM always,
  // WEAK behind the per-row toggle in weakShownStates). selectedIds
  // tracks which candidate the <select> currently points at (defaults
  // to the top visible match). addContactStates tracks the D3
  // checkbox, default-checked, per approval id.
  const [matchStates, setMatchStates] = useState<Record<string, PortcoMatch[]>>({});
  const [weakShownStates, setWeakShownStates] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const [addContactStates, setAddContactStates] = useState<Record<string, boolean>>({});
  const [linkApproveStates, setLinkApproveStates] = useState<
    Record<string, { loading: boolean; error?: string; contactNote?: string }>
  >({});

  useEffect(() => {
    loadApprovals();
    loadAwaiting();
  }, []);

  async function loadApprovals() {
    try {
      const res = await fetch("/api/admin/approvals");
      if (!res.ok) throw new Error("Failed to load approvals");
      const data = await res.json();
      const list: Approval[] = data.data ?? data ?? [];
      setApprovals(list);
      loadMatches(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Fires one GET per pending row — single digits of these in practice
  // (Promise.all, no new batched endpoint needed). Failure is silent per
  // row and the card just degrades to today's plain Approve/Reject,
  // exactly like loadAwaiting()'s catch below.
  async function loadMatches(list: Approval[]) {
    const entries = await Promise.all(
      list.map(async (a) => {
        try {
          const res = await fetch(`/api/admin/approvals/${a.id}/matches`);
          if (!res.ok) return [a.id, [] as PortcoMatch[]] as const;
          const data = await res.json();
          const matches: PortcoMatch[] = data.matches ?? [];
          return [a.id, matches] as const;
        } catch {
          return [a.id, [] as PortcoMatch[]] as const;
        }
      })
    );
    setMatchStates((prev) => {
      const next = { ...prev };
      for (const [id, matches] of entries) next[id] = matches;
      return next;
    });
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const [id, matches] of entries) {
        const visible = matches.filter((m) => m.tier !== "WEAK");
        const top = visible[0] ?? matches[0];
        if (top) next[id] = top.portfolioCompanyId;
      }
      return next;
    });
    setAddContactStates((prev) => {
      const next = { ...prev };
      for (const [id] of entries) if (!(id in next)) next[id] = true; // D3: default-checked
      return next;
    });
  }

  async function loadAwaiting() {
    try {
      const res = await fetch("/api/admin/approvals/awaiting");
      if (!res.ok) throw new Error("Failed to load awaiting-setup users");
      const data = await res.json();
      setAwaitingUsers(data.data ?? data ?? []);
    } catch {
      // Non-fatal — the pending queue above is the primary view; this
      // section simply stays empty/hidden if the fetch fails.
    } finally {
      setAwaitingLoading(false);
    }
  }

  async function handleResend(id: string) {
    setResendStates((prev) => ({ ...prev, [id]: { loading: true } }));

    try {
      const res = await fetch(`/api/admin/approvals/${id}/resend`, {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to resend link");
      }

      setResendStates((prev) => ({ ...prev, [id]: { loading: false, result: "sent" } }));
    } catch (err) {
      setResendStates((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: err instanceof Error ? err.message : "Failed to resend link",
        },
      }));
    }
  }

  async function handleDismissToggle(id: string, dismiss: boolean) {
    setDismissStates((prev) => ({ ...prev, [id]: { loading: true } }));

    try {
      const res = await fetch(
        `/api/admin/approvals/${id}/${dismiss ? "dismiss" : "undismiss"}`,
        { method: "POST" }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? `Failed to ${dismiss ? "dismiss" : "undismiss"}`);
      }

      const updated = await res.json();
      const applyDismissal = () =>
        setAwaitingUsers((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, setupQueueDismissedAt: updated.setupQueueDismissedAt } : u
          )
        );
      // Dismissing removes the row from the active list: fade it out first.
      if (dismiss) rowCollapse.run(id, null, applyDismissal);
      else applyDismissal();
      setDismissStates((prev) => ({ ...prev, [id]: { loading: false } }));
      if (dismiss) {
        // Reversible, so no confirm: say what happened and offer Undo (spec 6.5).
        const who = awaitingUsers.find((u) => u.id === id);
        toast.undo(`Dismissed ${who?.name ?? who?.email ?? "account"}.`, () => {
          void handleDismissToggle(id, false);
        });
      }
    } catch (err) {
      setDismissStates((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: err instanceof Error ? err.message : "Failed to update",
        },
      }));
    }
  }

  async function requestDelete(u: AwaitingUser) {
    const ok = await confirm({
      title: `Delete the account for ${u.name ?? u.email}`,
      description: "This removes the unfinished account and its setup link. It cannot be undone.",
      confirmLabel: "Delete account",
    });
    if (ok) await handleDelete(u.id);
  }

  async function handleDelete(id: string) {
    setDeleteStates((prev) => ({ ...prev, [id]: { loading: true } }));

    try {
      const res = await fetch(`/api/admin/approvals/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Failed to delete account");
      }

      rowCollapse.run(id, null, () => setAwaitingUsers((prev) => prev.filter((u) => u.id !== id)));
      setDeleteStates((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setDeleteStates((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: err instanceof Error ? err.message : "Failed to delete account",
        },
      }));
    }
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionStates((prev) => ({
      ...prev,
      [id]: { loading: true },
    }));

    try {
      const res = await fetch(`/api/admin/approvals/${id}/${action}`, {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? `Failed to ${action}`);
      }

      setActionStates((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          result: action === "approve" ? "approved" : "rejected",
        },
      }));
      // The sidebar's Approvals count is a shared SWR key: refresh it now rather than on the next navigation.
      void globalMutate(NAV_COUNTS_KEY);
    } catch (err) {
      setActionStates((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: err instanceof Error ? err.message : `Failed to ${action}`,
        },
      }));
    }
  }

  // Part 31, WS77 — D4's non-blocking "Link & approve". Exact ordering
  // matters: (1) link the portfolio company, stopping cold on any 4xx
  // so an approval never fires on top of a failed/conflicting link; (2)
  // optionally add the founder as a contact — non-fatal, never rolls
  // back the link from step 1; (3) approve through the existing,
  // unmodified handleAction so the setup email and USER_APPROVED audit
  // row go out exactly as they do today.
  async function handleLinkAndApprove(approval: Approval, portfolioCompanyId: string, addContact: boolean) {
    if (actionStates[approval.id]?.loading) return; // guard against double-approve
    setLinkApproveStates((prev) => ({ ...prev, [approval.id]: { loading: true } }));

    try {
      const linkRes = await fetch(`/api/admin/portfolio-companies/${portfolioCompanyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: approval.companyId }),
      });

      if (!linkRes.ok) {
        const errData = await linkRes.json().catch(() => null);
        setLinkApproveStates((prev) => ({
          ...prev,
          [approval.id]: { loading: false, error: errData?.error ?? "Failed to link portfolio company." },
        }));
        return; // stop — do not approve
      }

      let contactNote: string | undefined;
      if (addContact) {
        const result = await addPortcoContact(portfolioCompanyId, approval.email, approval.name);
        if (!result.ok) {
          contactNote = result.error ?? "Linked, but failed to add as a contact.";
        }
      }

      setLinkApproveStates((prev) => ({ ...prev, [approval.id]: { loading: false, contactNote } }));
      await handleAction(approval.id, "approve");
    } catch (err) {
      setLinkApproveStates((prev) => ({
        ...prev,
        [approval.id]: { loading: false, error: err instanceof Error ? err.message : "Failed to link portfolio company." },
      }));
    }
  }

  if (loading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="mb-2 h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </AppShell>
    );
  }

  const pendingApprovals = approvals.filter(
    (a) => !actionStates[a.id]?.result
  );
  const processedApprovals = approvals.filter(
    (a) => actionStates[a.id]?.result
  );

  return (
    <AppShell>
      <PageHeader
        title="Pending Approvals"
        description="Review and approve new sign-up requests from portfolio founders."
      />

      {approvals.length === 0 ? (
        <EmptyState eyebrow="Approvals"
          icon={<Inbox className="h-10 w-10" />}
          title="No pending approvals"
          description="All sign-up requests have been reviewed. New requests will appear here."
        />
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pendingApprovals.length > 0 && (
            <div className="space-y-4">
              {pendingApprovals.map((approval) => {
                const state = actionStates[approval.id];

                // Part 31, WS77 — suggestion block. STRONG/MEDIUM show by
                // default (D2); WEAK sits behind the per-row toggle.
                const matches = matchStates[approval.id] ?? [];
                const weakShown = weakShownStates[approval.id] ?? false;
                const visibleMatches = matches.filter((m) => m.tier !== "WEAK" || weakShown);
                const selectedId = selectedIds[approval.id];
                const selected =
                  visibleMatches.find((m) => m.portfolioCompanyId === selectedId) ?? visibleMatches[0];
                const addContact = addContactStates[approval.id] ?? true;
                const linkState = linkApproveStates[approval.id];
                const topReasonCopy = selected ? REASON_COPY[selected.reasons[0]] ?? "matched" : null;

                return (
                  <Card key={approval.id}>
                    <CardContent className="flex flex-wrap items-center gap-2 py-4">
                      <div className="min-w-48 flex-1">
                        <div className="flex items-center gap-2">
                          <UserPlus className="h-4 w-4 text-muted-foreground" />
                          <p className="font-medium">{approval.name}</p>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {approval.email}
                          {approval.companyName && (
                            <> &middot; {approval.companyName}</>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Signed up {formatDate(approval.createdAt)}
                        </p>
                        {state?.error && (
                          <p className="mt-1 text-xs text-destructive">
                            {state.error}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={state?.loading}
                          onClick={() => handleAction(approval.id, "reject")}
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          {state?.loading ? "..." : "Reject"}
                        </Button>
                        {selected && visibleMatches.length > 0 && (
                          <Button
                            size="sm"
                            disabled={state?.loading || linkState?.loading || selected.alreadyLinked}
                            onClick={() => handleLinkAndApprove(approval, selected.portfolioCompanyId, addContact)}
                          >
                            {linkState?.loading ? "..." : "Link & approve"}
                          </Button>
                        )}
                        <Button
                          variant={selected && visibleMatches.length > 0 ? "secondary" : "primary"}
                          size="sm"
                          disabled={state?.loading}
                          onClick={() => handleAction(approval.id, "approve")}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          {state?.loading ? "..." : "Approve"}
                        </Button>
                      </div>

                      {matches.length > 0 && (
                        <div className="w-full rounded-md border border-ochre/30 bg-ochre/10 px-3 py-2 text-sm">
                          {selected && visibleMatches.length > 0 ? (
                            <>
                              <p className="text-foreground">
                                Looks like <strong>{selected.portfolioCompanyName}</strong> in the portfolio —{" "}
                                {topReasonCopy}.
                              </p>
                              {selected.alreadyLinked && (
                                <p className="mt-1 text-xs text-tone-clay-ink">
                                  Already linked to another company — pick a different match, or just Approve.
                                </p>
                              )}
                              {visibleMatches.length > 1 && (
                                <div className="mt-2 max-w-xs">
                                  <Select
                                    value={selectedId}
                                    onChange={(e) =>
                                      setSelectedIds((prev) => ({ ...prev, [approval.id]: e.target.value }))
                                    }
                                  >
                                    {visibleMatches.map((m) => (
                                      <option key={m.portfolioCompanyId} value={m.portfolioCompanyId}>
                                        {m.portfolioCompanyName} ({m.tier.toLowerCase()}
                                        {m.alreadyLinked ? ", already linked" : ""})
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                              )}
                              {!selected.signupEmailIsAlreadyContact && (
                                <label className="mt-2 flex items-center gap-2 text-xs text-foreground">
                                  <input
                                    type="checkbox"
                                    checked={addContact}
                                    onChange={(e) =>
                                      setAddContactStates((prev) => ({ ...prev, [approval.id]: e.target.checked }))
                                    }
                                    className="h-3.5 w-3.5 rounded-sm border-ochre/50"
                                  />
                                  Also add {approval.email} as a contact on {selected.portfolioCompanyName}
                                </label>
                              )}
                            </>
                          ) : (
                            <p className="text-muted-foreground">
                              No strong matches — {matches.length} weaker match{matches.length === 1 ? "" : "es"} found.
                            </p>
                          )}
                          {matches.some((m) => m.tier === "WEAK") && (
                            <button
                              type="button"
                              className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
                              onClick={() =>
                                setWeakShownStates((prev) => ({ ...prev, [approval.id]: !weakShown }))
                              }
                            >
                              {weakShown ? "Hide weaker matches" : "Show weaker matches"}
                            </button>
                          )}
                          {linkState?.error && (
                            <p className="mt-1 text-xs text-destructive">{linkState.error}</p>
                          )}
                          {linkState?.contactNote && (
                            <p className="mt-1 text-xs text-muted-foreground">{linkState.contactNote}</p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Processed feedback */}
          {processedApprovals.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Recently Processed
              </h3>
              {processedApprovals.map((approval) => {
                const state = actionStates[approval.id];
                return (
                  <Card key={approval.id} className="opacity-60">
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{approval.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {approval.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {state?.result === "approved" ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-tone-sage-ink" />
                            <span className="text-tone-sage-ink">Approved</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-tone-clay-ink" />
                            <span className="text-tone-clay-ink">Rejected</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {pendingApprovals.length === 0 && processedApprovals.length > 0 && (
            <EmptyState
              icon={<CheckCircle2 className="h-10 w-10" />}
              title="All caught up"
              description="You've reviewed all pending approvals in this session."
            />
          )}
        </div>
      )}

      {/* Awaiting password setup — independent of the pending-queue empty
          state above: approved-but-unset accounts are a separate population
          (F21). Hidden entirely when empty (WS48: both sub-sections empty). */}
      {!awaitingLoading && awaitingUsers.length > 0 && (() => {
        const activeAwaiting = awaitingUsers.filter(
          (u) => !u.setupQueueDismissedAt && !isStale(u)
        );
        const dismissedOrStale = awaitingUsers.filter(
          (u) => u.setupQueueDismissedAt || isStale(u)
        );

        // Shared first columns for both tables.
        const personColumn: DataTableColumn<AwaitingUser> = {
          key: "person",
          header: "Person",
          sortValue: (u) => u.name ?? u.email,
          cell: (u) => {
            const errors = [resendStates[u.id]?.error, dismissStates[u.id]?.error, deleteStates[u.id]?.error].filter(Boolean);
            return (
              <span className="flex flex-col py-0.5">
                <span>{u.name ?? u.email}</span>
                {u.name && <span className="text-xs font-normal text-muted-foreground">{u.email}</span>}
                {errors.map((e, i) => (
                  <span key={i} role="alert" className="text-xs font-normal text-destructive">
                    {e}
                  </span>
                ))}
              </span>
            );
          },
        };
        const companyColumn: DataTableColumn<AwaitingUser> = {
          key: "company",
          header: "Company",
          sortValue: (u) => u.memberships?.[0]?.company?.name,
          mobile: "meta",
          cell: (u) => u.memberships?.[0]?.company?.name ?? <span className="text-muted-foreground">—</span>,
        };
        const resendButton = (u: AwaitingUser) => {
          const state = resendStates[u.id];
          return (
            <Button
              variant="ghost"
              size="sm"
              loading={state?.loading}
              disabled={state?.result === "sent"}
              onClick={() => handleResend(u.id)}
            >
              <Send className="h-3.5 w-3.5" />
              {state?.result === "sent" ? "Sent" : "Resend link"}
              <span className="sr-only"> to {u.name ?? u.email}</span>
            </Button>
          );
        };

        const activeColumns: DataTableColumn<AwaitingUser>[] = [
          personColumn,
          companyColumn,
          {
            key: "link",
            header: "Setup link",
            sortValue: (u) => (u.tokenExpiresAt ? new Date(u.tokenExpiresAt).getTime() : null),
            mobile: "meta",
            cell: (u) => {
              const expired = !u.tokenExpiresAt || new Date(u.tokenExpiresAt) < new Date();
              const isCompanyCreator = u.memberships.some((m) => m.company.createdById === u.id);
              return (
                <span className="flex flex-col py-0.5 font-normal">
                  <span className={`font-mono text-xs ${expired ? "text-tone-clay-ink" : "text-muted-foreground"}`}>
                    {u.tokenExpiresAt
                      ? expired
                        ? `expired ${formatDate(u.tokenExpiresAt)}`
                        : `expires ${formatDate(u.tokenExpiresAt)}`
                      : "no active link"}
                  </span>
                  {isCompanyCreator && (
                    <span className="text-xs text-muted-foreground">Created a company: use Dismiss</span>
                  )}
                </span>
              );
            },
          },
        ];

        const dismissedColumns: DataTableColumn<AwaitingUser>[] = [
          personColumn,
          companyColumn,
          {
            key: "state",
            header: "State",
            mobile: "meta",
            cell: (u) => (u.setupQueueDismissedAt ? "Dismissed" : "Link stale"),
          },
        ];

        return (
          <div className="mt-8 space-y-8">
            {activeAwaiting.length > 0 && (
              <section aria-labelledby="awaiting-heading" className="space-y-3">
                <div>
                  <h2 id="awaiting-heading" className="text-sm font-semibold text-foreground">
                    Awaiting password setup
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Approved accounts that haven&apos;t finished setup. Resend replaces the old link.
                  </p>
                </div>
                <DataTable<AwaitingUser>
                  label="Accounts awaiting password setup"
                  noun="account"
                  rows={activeAwaiting}
                  rowKey={(u) => u.id}
                  columns={activeColumns}
                  defaultSort={{ key: "person", dir: "asc" }}
                  searchText={(u) => [u.name, u.email, u.memberships?.[0]?.company?.name]}
                  searchPlaceholder="Filter accounts"
                  urlState={false}
                  minWidth={680}
                  actionsLabel="Row actions"
                  empty={null}
                  rowClassName={(u) => rowCollapse.className(u.id, "fade")}
                  rowActions={(u) => {
                    const isCompanyCreator = u.memberships.some((m) => m.company.createdById === u.id);
                    return (
                      <>
                        {resendButton(u)}
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={dismissStates[u.id]?.loading}
                          onClick={() => handleDismissToggle(u.id, true)}
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                          Dismiss
                          <span className="sr-only"> {u.name ?? u.email}</span>
                        </Button>
                        {!isCompanyCreator && (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={deleteStates[u.id]?.loading}
                            className="hover:text-tone-clay-ink"
                            onClick={() => requestDelete(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                            <span className="sr-only"> account for {u.name ?? u.email}</span>
                          </Button>
                        )}
                      </>
                    );
                  }}
                />
              </section>
            )}

            {dismissedOrStale.length > 0 && (
              <section aria-labelledby="dismissed-heading" className="space-y-2">
                <h3 id="dismissed-heading" className="text-sm font-medium text-muted-foreground">
                  Dismissed / stale ({dismissedOrStale.length})
                </h3>
                <DataTable<AwaitingUser>
                  label="Dismissed or stale accounts"
                  noun="account"
                  rows={dismissedOrStale}
                  rowKey={(u) => u.id}
                  columns={dismissedColumns}
                  defaultSort={{ key: "person", dir: "asc" }}
                  urlState={false}
                  minWidth={560}
                  actionsLabel="Row actions"
                  empty={null}
                  rowActions={(u) => (
                    <>
                      {resendButton(u)}
                      {u.setupQueueDismissedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={dismissStates[u.id]?.loading}
                          onClick={() => handleDismissToggle(u.id, false)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Undismiss
                          <span className="sr-only"> {u.name ?? u.email}</span>
                        </Button>
                      )}
                    </>
                  )}
                />
              </section>
            )}
          </div>
        );
      })()}
    </AppShell>
  );
}
