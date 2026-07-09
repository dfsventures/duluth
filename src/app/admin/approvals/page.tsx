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
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

interface Approval {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  createdAt: string;
}

interface AwaitingUser {
  id: string;
  email: string;
  name: string | null;
  status: string;
  tokenExpiresAt: string | null;
  createdAt: string;
  memberships: { company: { id: string; name: string } }[];
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

  useEffect(() => {
    loadApprovals();
    loadAwaiting();
  }, []);

  async function loadApprovals() {
    try {
      const res = await fetch("/api/admin/approvals");
      if (!res.ok) throw new Error("Failed to load approvals");
      const data = await res.json();
      setApprovals(data.data ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
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
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title="No pending approvals"
          description="All sign-up requests have been reviewed. New requests will appear here."
        />
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pendingApprovals.length > 0 && (
            <div className="space-y-3">
              {pendingApprovals.map((approval) => {
                const state = actionStates[approval.id];
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
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={state?.loading}
                          onClick={() => handleAction(approval.id, "reject")}
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          {state?.loading ? "..." : "Reject"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={state?.loading}
                          onClick={() => handleAction(approval.id, "approve")}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          {state?.loading ? "..." : "Approve"}
                        </Button>
                      </div>
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
                            <CheckCircle2 className="h-4 w-4 text-acacia" />
                            <span className="text-acacia">Approved</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-laterite" />
                            <span className="text-laterite">Rejected</span>
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
          (F21). Hidden entirely when empty. */}
      {!awaitingLoading && awaitingUsers.length > 0 && (
        <div className="mt-8 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Awaiting password setup
            </h2>
            <p className="text-sm text-muted-foreground">
              Approved accounts that haven&apos;t finished setup. Resend replaces the old link.
            </p>
          </div>
          {awaitingUsers.map((u) => {
            const state = resendStates[u.id];
            const companyName = u.memberships?.[0]?.company?.name ?? null;
            const expired = !u.tokenExpiresAt || new Date(u.tokenExpiresAt) < new Date();
            return (
              <Card key={u.id}>
                <CardContent className="flex flex-wrap items-center gap-2 py-4">
                  <div className="min-w-48 flex-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{u.name ?? u.email}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {u.email}
                      {companyName && <> &middot; {companyName}</>}
                    </p>
                    <p
                      className={`font-mono text-xs ${expired ? "text-laterite" : "text-muted-foreground"}`}
                    >
                      {u.tokenExpiresAt
                        ? expired
                          ? `link expired ${formatDate(u.tokenExpiresAt)}`
                          : `expires ${formatDate(u.tokenExpiresAt)}`
                        : "no active link"}
                    </p>
                    {state?.error && (
                      <p className="mt-1 text-xs text-destructive">{state.error}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={state?.loading || state?.result === "sent"}
                      onClick={() => handleResend(u.id)}
                    >
                      <Send className="mr-1 h-3.5 w-3.5" />
                      {state?.loading
                        ? "Sending..."
                        : state?.result === "sent"
                          ? "Sent ✓"
                          : "Resend link"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
