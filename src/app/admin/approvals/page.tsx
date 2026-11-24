"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Inbox,
  Send,
  EyeOff,
  Eye,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterBar, FilterSearch } from "@/components/ui/filter-bar";
import { matchesQuery } from "@/lib/data-table";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { noticeClasses } from "@/components/ui/notice";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { formatDate } from "@/lib/utils";
import { addPortcoContact } from "@/lib/portco-link-contact";
import { PageSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { mutate as globalMutate } from "swr";
import { NAV_COUNTS_KEY } from "@/lib/fetcher";
import { useRowCollapse } from "@/lib/use-row-collapse";
import { OpenParam, SplitView } from "@/components/layout/split-view";
import { DetailPane, PaneCard, PaneChip, PaneDetails, PaneSection } from "@/components/layout/detail-pane";
import { NameTile } from "@/components/ui/name-tile";
import { crumbLabel, nextAfterRemoval, stepCursor } from "@/lib/split-view";
import { isTypingTarget } from "@/lib/shortcuts";
import { TONE_CLASSES } from "@/lib/status-tone";

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

interface UnclaimedMatch {
  id: string;
  name: string;
  reasons: string[];
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

// WS160: watches the per-signup results. When one lands (from Approve, Reject, Link &
// approve or Add-to-company, whichever path produced it) it keeps the row on screen while it
// fades, says what happened, and moves the open pane on to the next signup. It renders nothing.
// It runs in a layout effect so the row never leaves the screen for a frame before it fades.
function LeaveWatcher({
  results,
  onNew,
}: {
  results: Record<string, { result?: "approved" | "rejected" }>;
  onNew: (id: string, result: "approved" | "rejected") => void;
}) {
  // Results that were already there when this mounted are not news.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) {
    seen.current = new Set(Object.entries(results).filter(([, s]) => s.result).map(([id]) => id));
  }
  useLayoutEffect(() => {
    const known = seen.current as Set<string>;
    for (const [id, s] of Object.entries(results)) {
      if (s.result && !known.has(id)) {
        known.add(id);
        onNew(id, s.result);
      }
    }
  });
  return null;
}

// PLAN-1, WS164: `a` approves the signup open in the pane, the same as its Approve
// button (which shows the A hint). Off while that signup is busy or done, while typing in a field
// or a select, inside a dialog or menu, and with a modifier held. Renders nothing.
function ApproveKey({ onApprove }: { onApprove: (() => void) | null }) {
  useEffect(() => {
    if (!onApprove) return;
    const approve = onApprove;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "a" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(document.activeElement) || document.querySelector('[role="menu"][data-state="open"]')) return;
      e.preventDefault();
      approve();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onApprove]);
  return null;
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
  // WS160: the pending list shows as dense rows beside a pane. `visibleRows` is the
  // list as shown (it gives the pane its position and previous / next).
  // Audit #18: one filter at the top of the page narrows all three tables.
  const [pageQuery, setPageQuery] = useState("");
  const [visibleRows, setVisibleRows] = useState<Approval[]>([]);
  const visibleKeys = useMemo(() => visibleRows.map((a) => a.id), [visibleRows]);
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

  // Part 45, WS153 — companies with no founder yet that a signup's company
  // looks like, and the per-row state of the "add to it instead" action.
  const [unclaimedStates, setUnclaimedStates] = useState<Record<string, UnclaimedMatch[]>>({});
  const [joinStates, setJoinStates] = useState<Record<string, { loading: boolean; error?: string }>>({});

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
    const unclaimedEntries: [string, UnclaimedMatch[]][] = [];
    const entries = await Promise.all(
      list.map(async (a) => {
        try {
          const res = await fetch(`/api/admin/approvals/${a.id}/matches`);
          if (!res.ok) return [a.id, [] as PortcoMatch[]] as const;
          const data = await res.json();
          const matches: PortcoMatch[] = data.matches ?? [];
          unclaimedEntries.push([a.id, (data.unclaimed ?? []) as UnclaimedMatch[]]);
          return [a.id, matches] as const;
        } catch {
          return [a.id, [] as PortcoMatch[]] as const;
        }
      })
    );
    setUnclaimedStates((prev) => {
      const next = { ...prev };
      for (const [id, u] of unclaimedEntries) next[id] = u;
      return next;
    });
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

  // Part 45, WS153 — add the signup to an existing company with no founder
  // instead of approving a second company: join (stop on any failure), then the
  // existing, unmodified approve flow.
  async function handleJoinAndApprove(approval: Approval, companyId: string) {
    if (actionStates[approval.id]?.loading) return;
    setJoinStates((prev) => ({ ...prev, [approval.id]: { loading: true } }));
    try {
      const res = await fetch(`/api/admin/approvals/${approval.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setJoinStates((prev) => ({
          ...prev,
          [approval.id]: { loading: false, error: errData?.error ?? "Failed to add to that company." },
        }));
        return; // stop — do not approve
      }
      setJoinStates((prev) => ({ ...prev, [approval.id]: { loading: false } }));
      await handleAction(approval.id, "approve");
    } catch (err) {
      setJoinStates((prev) => ({
        ...prev,
        [approval.id]: { loading: false, error: err instanceof Error ? err.message : "Failed to add to that company." },
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

  // A row that was just approved or rejected stays (fading) until its fade ends.
  const pendingApprovals = approvals.filter(
    (a) => !actionStates[a.id]?.result || rowCollapse.isCollapsing(a.id)
  );
  const processedApprovals = approvals.filter(
    (a) => actionStates[a.id]?.result && !rowCollapse.isCollapsing(a.id)
  );
  // The page-level filter (audit #18) narrows the signups here and the two account tables below.
  const shownPending = pageQuery.trim()
    ? pendingApprovals.filter((a) => matchesQuery([a.name, a.email, a.companyName], pageQuery))
    : pendingApprovals;
  const matchesPageQuery = (...fields: (string | null | undefined)[]) => !pageQuery.trim() || matchesQuery(fields, pageQuery);
  // The filter shows only when there is enough to narrow (audit #14).
  const showPageFilter = approvals.length + awaitingUsers.length >= 8;

  // Part 31, WS77 / Part 45, WS153 — the per-signup view of the portfolio-company suggestion
  // (STRONG/MEDIUM show by default (D2); WEAK sits behind the per-row toggle) and of the
  // unclaimed-company match, as the pane shows it.
  function suggestionView(approval: Approval) {
    const state = actionStates[approval.id];
    const matches = matchStates[approval.id] ?? [];
    const weakShown = weakShownStates[approval.id] ?? false;
    const visibleMatches = matches.filter((m) => m.tier !== "WEAK" || weakShown);
    const selectedId = selectedIds[approval.id];
    const selected = visibleMatches.find((m) => m.portfolioCompanyId === selectedId) ?? visibleMatches[0];
    const addContact = addContactStates[approval.id] ?? true;
    const linkState = linkApproveStates[approval.id];
    // Part 45 (WS153): STRONG-ish unclaimed matches first; weaker
    // (name-token only) stay behind "Show weaker matches" as in the
    // portfolio block above.
    const unclaimedAll = unclaimedStates[approval.id] ?? [];
    const unclaimed = unclaimedAll.find((u) => !(u.reasons.length === 1 && u.reasons[0] === "NAME_TOKENS") || weakShown);
    const joinState = joinStates[approval.id];
    const topReasonCopy = selected ? REASON_COPY[selected.reasons[0]] ?? "matched" : null;
    return {
      state,
      matches,
      weakShown,
      visibleMatches,
      selectedId,
      selected,
      addContact,
      linkState,
      unclaimedAll,
      unclaimed,
      joinState,
      topReasonCopy,
    };
  }

  // The three suggestion blocks (add to an existing company, "show weaker", the portfolio match
  // with its picker, contact checkbox and errors), shown in the pane.
  function renderSuggestion(approval: Approval, v: ReturnType<typeof suggestionView>) {
    const { state, matches, weakShown, visibleMatches, selectedId, selected, addContact, linkState, unclaimedAll, unclaimed, joinState, topReasonCopy } = v;
    return (
      <>
        {unclaimed && (
          <div className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-foreground">
              Molly already has a page for <strong>{unclaimed.name}</strong> with no founder. Add{" "}
              {approval.name} to it instead of approving a second company?
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={state?.loading || joinState?.loading}
                onClick={() => handleJoinAndApprove(approval, unclaimed.id)}
              >
                {joinState?.loading ? "..." : `Add ${approval.name} to ${unclaimed.name} instead`}
              </Button>
            </div>
            {joinState?.error && <p className="mt-1 text-xs text-destructive">{joinState.error}</p>}
          </div>
        )}

        {!unclaimed && unclaimedAll.length > 0 && matches.length === 0 && (
          <button
            type="button"
            className="w-full text-left text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => setWeakShownStates((prev) => ({ ...prev, [approval.id]: true }))}
          >
            Show weaker matches
          </button>
        )}

        {matches.length > 0 && (
          <div className={noticeClasses("amber", "w-full px-3 py-2")}>
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
      </>
    );
  }

  // The "Recently Processed" and "All caught up" blocks.
  const processedBlock = processedApprovals.length > 0 && (
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
  );
  const caughtUpBlock = pendingApprovals.length === 0 && processedApprovals.length > 0 && (
    <EmptyState
      icon={<CheckCircle2 className="h-10 w-10" />}
      title="All caught up"
      description="You've reviewed all pending approvals in this session."
    />
  );

  // The pane for one signup. Approve is the primary; "Link & approve" (when there is a match) and
  // "Add to the unclaimed company" keep the order link, then contact, then approve.
  function renderApprovalPane(
    approval: Approval,
    nav: { crumb: string; onPrev?: () => void; onNext?: () => void; onClose: () => void }
  ) {
    const v = suggestionView(approval);
    const { state, visibleMatches, selected, addContact, linkState, matches } = v;
    const hasMatch = Boolean(selected && visibleMatches.length > 0);
    const busy = Boolean(state?.loading || state?.result);
    return (
      <DetailPane
        crumb={nav.crumb}
        title={approval.name}
        mark={<NameTile name={approval.name} kind="person" className="mr-0 v2:h-8 v2:w-8 v2:text-[13px]" />}
        onPrev={nav.onPrev}
        onNext={nav.onNext}
        onClose={nav.onClose}
        chips={
          <>
            <PaneChip className={TONE_CLASSES.sky.chip}>Founder signup</PaneChip>
            <PaneChip>{approval.email}</PaneChip>
            <PaneChip>Signed up {formatDate(approval.createdAt)}</PaneChip>
          </>
        }
        card={
          <PaneCard
            heading={`Approve ${approval.name}`}
            actions={
              <>
                <Button disabled={busy} loading={Boolean(state?.loading)} kbd="A" onClick={() => handleAction(approval.id, "approve")}>
                  Approve
                </Button>
                {hasMatch && selected && (
                  <Button
                    variant="secondary"
                    disabled={busy || Boolean(linkState?.loading) || selected.alreadyLinked}
                    onClick={() => handleLinkAndApprove(approval, selected.portfolioCompanyId, addContact)}
                  >
                    {linkState?.loading ? "..." : "Link & approve"}
                  </Button>
                )}
                <Button variant="destructive" disabled={busy} onClick={() => handleAction(approval.id, "reject")}>
                  Reject
                </Button>
              </>
            }
          >
            {state?.error && (
              <span role="alert" className="mb-2 block text-meta text-destructive">
                {state.error}
              </span>
            )}
            {hasMatch && selected
              ? `This signup looks like it belongs to ${selected.portfolioCompanyName}. Approve adds them as they are; Link & approve links the account to that company first.`
              : approval.companyName
                ? `No company matches yet. You can link ${approval.companyName} after approving.`
                : "No company matches yet."}
          </PaneCard>
        }
      >
        {(v.unclaimed || matches.length > 0 || v.unclaimedAll.length > 0) && (
          <PaneSection title="Link suggestion">
            <div className="space-y-3">{renderSuggestion(approval, v)}</div>
          </PaneSection>
        )}
        <PaneSection title="Why you're seeing this">
          <p>
            {approval.name} signed up with {approval.email}
            {approval.companyName ? ` and asked to join ${approval.companyName}` : ""}. They are waiting for your approval.
          </p>
        </PaneSection>
        <PaneSection title="Details">
          <PaneDetails
            rows={[
              { label: "Company asked for", value: approval.companyName ?? "—" },
              { label: "Suggested link", value: selected && hasMatch ? selected.portfolioCompanyName : "None" },
              { label: "Email", value: approval.email },
              { label: "Signed up", value: formatDate(approval.createdAt) },
            ]}
          />
        </PaneSection>
      </DetailPane>
    );
  }

  return (
    <AppShell width="full">
      <PageHeader
        title="Pending Approvals"
        description="Review and approve new sign-up requests from portfolio founders."
      />

      {showPageFilter && (
        <FilterBar
          className="mb-6"
          label="Filter approvals"
          chips={[]}
          onOpen={() => {}}
          onRemove={() => {}}
          onClearAll={() => setPageQuery("")}
          showClear={pageQuery.trim() !== ""}
          leading={
            <FilterSearch
              id="approvals-filter"
              label="Filter signups and accounts"
              value={pageQuery}
              onChange={setPageQuery}
              onKeyDown={(e) => {
                if (e.key === "Escape") setPageQuery("");
              }}
              placeholder="Filter by name or email"
              hint={false}
            />
          }
        />
      )}

      {approvals.length === 0 ? (
        <div className="v2:py-3">
          <EmptyState eyebrow="Approvals"
            icon={<Inbox className="h-10 w-10" />}
            title="No pending approvals"
            description="All sign-up requests have been reviewed. New requests will appear here."
          />
        </div>
      ) : (
        <>
          {pendingApprovals.length > 0 && (
            <h2 className="mx-[var(--row-pad)] mb-3 flex items-baseline gap-1.5 text-row font-medium text-foreground">
              Awaiting approval
              <span aria-hidden="true" className="text-meta font-normal text-muted-foreground">{shownPending.length}</span>
              <span className="sr-only">{`, ${shownPending.length} waiting`}</span>
            </h2>
          )}
          {pendingApprovals.length > 0 && (
            <OpenParam fallback={<TableSkeleton rows={4} cols={4} />}>
              {(openId, setOpenId) => {
                const closePane = () => setOpenId(null);
                const step = (delta: 1 | -1) => {
                  const to = stepCursor(visibleKeys, openId, delta);
                  if (to) setOpenId(to);
                };
                // A signup that was just approved stays in the pane (its buttons off) until the pane
                // moves on, so the pane does not flash shut between two signups.
                const openApproval = openId ? (approvals.find((a) => a.id === openId) ?? null) : null;
                const at = openApproval ? visibleKeys.indexOf(openApproval.id) : -1;
                const openState = openApproval ? actionStates[openApproval.id] : undefined;
                const approveId = openApproval?.id;
                return (
                  <>
                    <ApproveKey
                      onApprove={
                        approveId && !openState?.loading && !openState?.result ? () => handleAction(approveId, "approve") : null
                      }
                    />
                    <LeaveWatcher
                      results={actionStates}
                      onNew={(id, result) => {
                        // Keep the row on screen while it fades, say what happened, and move the
                        // pane on to the next signup (or close it when this was the last).
                        const who = approvals.find((a) => a.id === id)?.name ?? "signup";
                        rowCollapse.run(id, null, () => {});
                        toast.success(`${result === "approved" ? "Approved" : "Rejected"} ${who}.`);
                        if (openId === id) setOpenId(nextAfterRemoval(visibleKeys, id));
                      }}
                    />
                    <SplitView
                      open={openId}
                      onClose={closePane}
                      paneLabel={openApproval?.name}
                      pane={
                        openApproval
                          ? renderApprovalPane(openApproval, {
                              crumb: crumbLabel("Approvals", visibleKeys, openApproval.id),
                              onPrev: at > 0 ? () => step(-1) : undefined,
                              onNext: at !== -1 && at < visibleKeys.length - 1 ? () => step(1) : undefined,
                              onClose: closePane,
                            })
                          : null
                      }
                      list={
                        <DataTable<Approval>
                          label="Awaiting approval"
                          noun="signup"
                          rows={shownPending}
                          rowKey={(a) => a.id}
                          onOpenRow={(a) => setOpenId(a.id)}
                          openKey={openId}
                          onVisibleRowsChange={setVisibleRows}
                          rowClassName={(a) => rowCollapse.className(a.id, "fade")}
                          defaultSort={{ key: "signedUp", dir: "desc" }}
                          empty={null}
                          columns={[
                            {
                              key: "name",
                              header: "Person",
                              sortValue: (a) => a.name,
                              cell: (a) => (
                                <>
                                  <NameTile name={a.name} kind="person" className="v2:mr-3 v2:h-5 v2:w-5 v2:text-[10px]" />
                                  <span className="min-w-0 truncate" title={a.name}>
                                    {a.name}
                                  </span>
                                </>
                              ),
                            },
                            {
                              key: "email",
                              header: "Email",
                              dropBelow: 480,
                              mobile: "meta",
                              sortValue: (a) => a.email,
                              cell: (a) => a.email,
                            },
                            {
                              key: "company",
                              header: "Company",
                              dropBelow: 600,
                              mobile: "meta",
                              sortValue: (a) => a.companyName,
                              cell: (a) => a.companyName ?? <span className="text-muted-foreground">—</span>,
                            },
                            {
                              key: "signedUp",
                              header: "Signed up",
                              align: "num",
                              firstDir: "desc",
                              mobile: "meta",
                              sortValue: (a) => new Date(a.createdAt).getTime(),
                              cell: (a) => formatDate(a.createdAt),
                            },
                          ]}
                        />
                      }
                    />
                  </>
                );
              }}
            </OpenParam>
          )}
          {(processedBlock || caughtUpBlock) && (
            <div className="space-y-6 v2:mx-[var(--row-pad)] v2:max-w-[var(--column-wide)] v2:pt-6">
              {processedBlock}
              {caughtUpBlock}
            </div>
          )}
        </>
      )}

      {/* Awaiting password setup — independent of the pending-queue empty
          state above: approved-but-unset accounts are a separate population
          (F21). Hidden entirely when empty (WS48: both sub-sections empty). */}
      {!awaitingLoading && awaitingUsers.length > 0 && (() => {
        const inFilter = (u: AwaitingUser) => matchesPageQuery(u.name, u.email, u.memberships?.[0]?.company?.name);
        const activeAwaiting = awaitingUsers.filter(
          (u) => !u.setupQueueDismissedAt && !isStale(u) && inFilter(u)
        );
        const dismissedOrStale = awaitingUsers.filter(
          (u) => (u.setupQueueDismissedAt || isStale(u)) && inFilter(u)
        );
        // Audit #16: the two account tables share one column template, so their right-hand
        // actions end at the same x. Person (flexible), Company 240, Detail 200, Actions 280.
        const TEMPLATE = [null, 240, 200, 280];

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
                  <span className={`font-mono text-xs v2:font-sans v2:text-meta ${expired ? "text-tone-clay-ink" : "text-muted-foreground"}`}>
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
            cell: (u) => (u.setupQueueDismissedAt ? "Dismissed" : "Link expired"),
          },
        ];

        return (
          <div className="mt-8 space-y-8 v2:mx-[var(--row-pad)] v2:mt-12 v2:max-w-[var(--column-wide)] v2:space-y-12">
            {activeAwaiting.length > 0 && (
              <section aria-labelledby="awaiting-heading" className="space-y-3">
                <div>
                  <h2 id="awaiting-heading" className="text-sm font-semibold text-foreground v2:flex v2:items-baseline v2:gap-1.5 v2:text-row v2:font-medium">
                    Awaiting password setup
                    <span aria-hidden="true" className="hidden text-meta font-normal text-muted-foreground v2:inline">{activeAwaiting.length}</span>
                    <span className="sr-only">{`, ${activeAwaiting.length} ${activeAwaiting.length === 1 ? "account" : "accounts"}`}</span>
                  </h2>
                  <p className="text-sm text-muted-foreground v2:mt-1 v2:text-meta">
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
                  searchPlaceholder="Filter accounts"
                  urlState={false}
                  minWidth={680}
                  columnWidths={TEMPLATE}
                  actionsLabel="Row actions"
                  actionsAlwaysVisible
                  empty={null}
                  rowClassName={(u) => rowCollapse.className(u.id, "fade")}
                  rowActions={(u) => {
                    const isCompanyCreator = u.memberships.some((m) => m.company.createdById === u.id);
                    // Audit #17: Resend link stays; Dismiss and Delete go in a menu, Delete last in clay.
                    return (
                      <>
                        {resendButton(u)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`More actions for ${u.name ?? u.email}`}>
                              <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => handleDismissToggle(u.id, true)}>
                              <EyeOff aria-hidden className="h-3.5 w-3.5" />
                              Dismiss
                            </DropdownMenuItem>
                            {!isCompanyCreator && (
                              <DropdownMenuItem onSelect={() => requestDelete(u)} className="text-tone-clay-ink">
                                <Trash2 aria-hidden className="h-3.5 w-3.5" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    );
                  }}
                />
              </section>
            )}

            {dismissedOrStale.length > 0 && (
              <section aria-labelledby="dismissed-heading" className="space-y-2">
                <h3 id="dismissed-heading" className="text-sm font-medium text-muted-foreground v2:flex v2:items-baseline v2:gap-1.5 v2:text-row v2:text-foreground">
                  Dismissed or expired <span aria-hidden="true" className="hidden text-meta font-normal text-muted-foreground v2:inline">{dismissedOrStale.length}</span>
                  <span className="sr-only hidden v2:inline">{`, ${dismissedOrStale.length} ${dismissedOrStale.length === 1 ? "account" : "accounts"}`}</span>
                  <span className="v2:hidden">({dismissedOrStale.length})</span>
                </h3>
                <DataTable<AwaitingUser>
                  label="Dismissed or expired accounts"
                  noun="account"
                  rows={dismissedOrStale}
                  rowKey={(u) => u.id}
                  columns={dismissedColumns}
                  defaultSort={{ key: "person", dir: "asc" }}
                  urlState={false}
                  minWidth={560}
                  columnWidths={TEMPLATE}
                  actionsLabel="Row actions"
                  actionsAlwaysVisible
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
