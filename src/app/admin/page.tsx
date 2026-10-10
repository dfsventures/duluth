"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertCircle, Bell, CheckCircle2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { buildAttention } from "@/lib/attention";
import { toast } from "@/lib/toast";
import { fetcher, NAV_COUNTS_KEY } from "@/lib/fetcher";
import { useRowCollapse } from "@/lib/use-row-collapse";
import { RefreshIndicator, StaleRegion } from "@/components/ui/stale";
import { cn } from "@/lib/utils";
import { Skeleton, KpiSkeleton, TableSkeleton } from "@/components/ui/skeleton";

interface OverdueCompany {
  id: string;
  name: string;
  sector: string | null;
  daysSinceUpdate: number | null;
  lastReminderSentAt: string | null;
}

interface DashboardData {
  totalCompanies: number;
  pendingApprovals: number;
  updatesThisMonth: number;
  companiesOverdue: number;
  noMetricsCount: number;
  overdueCompanies: OverdueCompany[];
  updatesByMonth: { month: string; count: number }[];
  sectorBreakdown: { sector: string; count: number }[];
}

interface MetricAlert {
  id: string;
  rule: string;
  message: string;
  firedAt: string;
  company: { id: string; name: string };
  metricDefinition: { name: string; unit: string | null } | null;
}

// Rows of "behind on updates" shown before the toggle; queues and alerts always show.
const OVERDUE_VISIBLE = 5;

export default function AdminDashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const authed = sessionStatus === "authenticated";
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [reminding, setReminding] = useState<Record<string, boolean>>({});
  const [remindedAt, setRemindedAt] = useState<Record<string, string>>({});
  const rowCollapse = useRowCollapse();

  // SWR keeps the last data on screen during a refetch (spec 6.6) and shares the
  // nav-counts key with the sidebar, so one fetch feeds both.
  const {
    data: dashboard,
    error: dashboardError,
    isValidating: dashboardValidating,
  } = useSWR<DashboardData>(authed ? "/api/admin/dashboard" : null, fetcher, { keepPreviousData: true });
  // Alerts and queue counts never block the dashboard: failures just hide them.
  const {
    data: alertsData,
    isValidating: alertsValidating,
    mutate: mutateAlerts,
  } = useSWR<MetricAlert[]>(authed ? "/api/admin/alerts" : null, fetcher, { keepPreviousData: true });
  const { data: counts, isValidating: countsValidating } = useSWR<{ diligence?: number; boardReview?: number }>(
    authed ? NAV_COUNTS_KEY : null,
    fetcher,
    { keepPreviousData: true }
  );
  const alerts = useMemo(() => alertsData ?? [], [alertsData]);
  const queues = { diligence: counts?.diligence ?? 0, boardReview: counts?.boardReview ?? 0 };
  const refreshing = dashboardValidating || alertsValidating || countsValidating;
  const loading = !dashboard && !dashboardError;
  const error = !dashboard && dashboardError ? dashboardError.message : null;

  const attention = useMemo(
    () =>
      buildAttention({
        pendingApprovals: dashboard?.pendingApprovals ?? 0,
        diligenceReady: queues.diligence,
        boardReview: queues.boardReview,
        alerts,
        overdue: dashboard?.overdueCompanies ?? [],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboard, queues.diligence, queues.boardReview, alerts]
  );

  // Dismiss is reversible, so it is optimistic with an Undo toast (spec 6.5):
  // the row collapses and leaves at once, PATCH { resolved: true } runs behind
  // it, and a failure puts the row back with a Retry. Undo sends { resolved: false }.
  async function setAlertResolved(id: string, resolved: boolean) {
    const res = await fetch(`/api/admin/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    if (!res.ok) throw new Error("request failed");
  }

  async function dismissAlert(id: string, row: Element | null) {
    const before = alerts;
    const removeFromList = () =>
      mutateAlerts((prev) => (prev ?? []).filter((a) => a.id !== id), { revalidate: false });
    await new Promise<void>((resolve) => rowCollapse.run(`alert:${id}`, row, () => resolve()));
    await removeFromList();
    try {
      await setAlertResolved(id, true);
      toast.undo("Alert dismissed.", async () => {
        try {
          await setAlertResolved(id, false);
          await mutateAlerts();
        } catch {
          toast.error("Couldn't undo the dismissal.");
        }
      });
    } catch {
      await mutateAlerts(before, { revalidate: true });
      toast.error("Couldn't dismiss the alert.", { retry: () => dismissAlert(id, null) });
    }
  }

  function alertAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  }

  if (sessionStatus === "loading" || loading) {
    return (
      <AppShell>
        <div className="space-y-6"><Skeleton className="h-7 w-56" /><KpiSkeleton /><TableSkeleton rows={4} cols={4} /></div>
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

  const d = dashboard!;

  async function sendReminder(companyId: string) {
    setReminding((prev) => ({ ...prev, [companyId]: true }));
    try {
      const res = await fetch(`/api/companies/${companyId}/remind`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRemindedAt((prev) => ({ ...prev, [companyId]: data.lastReminderSentAt }));
        const name = dashboard?.overdueCompanies?.find((c) => c.id === companyId)?.name;
        toast.success(name ? `Reminder sent to ${name}.` : "Reminder sent.");
      } else {
        // Server-confirmed action: never optimistic. No Retry: a resend could
        // email the founders twice, so it is not idempotent (spec 6.5).
        toast.error("Couldn't send the reminder.");
      }
    } catch {
      toast.error("Couldn't send the reminder.");
    } finally {
      setReminding((prev) => ({ ...prev, [companyId]: false }));
    }
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  }

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${session?.user?.name ? `, ${session.user.name}` : ""}. Here is what needs you today.`}
        indicator={<RefreshIndicator active={refreshing} />}
      />

      <StaleRegion refreshing={refreshing}>

      {/* Quiet stat strip: numbers and mono labels, no icons or boxes. */}
      <dl
        aria-label="Portfolio totals"
        className="mb-8 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-border py-3 lg:grid-cols-4"
      >
        {[
          { label: "Companies", value: d.totalCompanies, hint: undefined as string | undefined },
          { label: "Updates this month", value: d.updatesThisMonth, hint: undefined },
          { label: "Behind on updates", value: d.companiesOverdue, hint: undefined },
          { label: "Awaiting approval", value: d.pendingApprovals, hint: undefined },
        ].map((k) => (
          <div key={k.label}>
            <dt className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">{k.label}</dt>
            <dd className="mt-0.5 font-display text-xl font-semibold text-foreground">{k.value}</dd>
          </div>
        ))}
      </dl>

      {/* Needs attention: the job of this page is "what needs me today". */}
      <section aria-labelledby="attention-heading" className="mb-10">
        <div className="mb-3 flex items-baseline gap-3">
          <h2 id="attention-heading" className="font-display text-heading text-foreground">
            Needs attention
          </h2>
          {attention.length > 0 && <Badge variant="neutral">{attention.length}</Badge>}
        </div>

        {attention.length === 0 ? (
          <div className="flex items-center gap-3 border border-border bg-card px-4 py-5 text-sm">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-tone-sage-ink" />
            <div>
              <p className="font-medium text-foreground">Nothing needs you right now.</p>
              <p className="text-muted-foreground">Approvals, diligence, alerts and company updates are all clear.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-row-divider border border-border bg-card">
            {(() => {
              const overdueItems = attention.filter((i) => i.kind === "overdue");
              const hiddenOverdue = new Set(showAllOverdue ? [] : overdueItems.slice(OVERDUE_VISIBLE).map((i) => i.id));
              return attention
                .filter((i) => !hiddenOverdue.has(i.id))
                .map((item) => {
                  const company = item.kind === "overdue" ? d.overdueCompanies.find((c) => c.id === item.companyId) : null;
                  const remindedTs = company ? (remindedAt[company.id] ?? company.lastReminderSentAt) : null;
                  return (
                    <li key={item.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", rowCollapse.className(item.id))}>
                      <div className="min-w-0 flex-1 basis-64">
                        <StatusDot tone={item.tone} className="items-start font-medium">
                          <span>
                            {item.kind === "overdue" || item.kind === "alert" ? (
                              <Link href={item.href} className="hover:underline">
                                {item.title}
                              </Link>
                            ) : (
                              item.title
                            )}
                          </span>
                        </StatusDot>
                        {(item.detail || remindedTs) && (
                          <p className="ml-[15px] text-xs text-muted-foreground">
                            {item.detail}
                            {item.detail && remindedTs ? " · " : ""}
                            {remindedTs ? `Reminded ${timeAgo(remindedTs).toLowerCase()}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {item.action === "remind" && company && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={reminding[company.id]}
                            onClick={() => sendReminder(company.id)}
                          >
                            <Bell className="h-3.5 w-3.5" />
                            Remind
                            <span className="sr-only"> {company.name}</span>
                          </Button>
                        )}
                        {item.action === "dismiss" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => dismissAlert(item.id.replace("alert:", ""), e.currentTarget.closest("li"))}
                          >
                            Dismiss
                            <span className="sr-only">: {item.title}</span>
                          </Button>
                        )}
                        {!item.action && (
                          <Link
                            href={item.href}
                            className="inline-flex h-8 items-center border border-border px-3 text-[13px] font-medium text-foreground transition-colors hover:border-[var(--color-border-hover)] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Review
                            <span className="sr-only">: {item.title}</span>
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                });
            })()}
          </ul>
        )}

        {attention.filter((i) => i.kind === "overdue").length > OVERDUE_VISIBLE && (
          <button
            type="button"
            onClick={() => setShowAllOverdue((v) => !v)}
            className="mt-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showAllOverdue
              ? "Show fewer companies"
              : `Show all ${attention.filter((i) => i.kind === "overdue").length} companies behind on updates`}
          </button>
        )}
      </section>

      {/* Second row: chart + sector breakdown */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Updates per month bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Updates Published — Last 6 Months</CardTitle>
          </CardHeader>
          <CardContent>
            {d.updatesByMonth.every((m) => m.count === 0) ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No published updates yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={d.updatesByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [v, "Updates"]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: "2px",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <Bar dataKey="count" fill="var(--color-accent)" radius={0} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Sector breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Portfolio by Sector</CardTitle>
          </CardHeader>
          <CardContent>
            {d.sectorBreakdown.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No sectors assigned.</p>
            ) : (
              <ul className="space-y-2">
                {d.sectorBreakdown.map(({ sector, count }) => (
                  <li key={sector} className="flex items-center justify-between text-sm">
                    <span className="truncate text-muted-foreground">{sector}</span>
                    <Badge variant="neutral">{count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      </StaleRegion>
    </AppShell>
  );
}
