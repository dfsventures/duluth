"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { AlertCircle } from "lucide-react";
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
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { NeedsYouInbox } from "@/components/admin/needs-you-inbox";
import { buildAttention } from "@/lib/attention";
import { buildInboxRows } from "@/lib/needs-you";
import { toast } from "@/lib/toast";
import { fetcher, NAV_COUNTS_KEY } from "@/lib/fetcher";
import { useRowCollapse } from "@/lib/use-row-collapse";
import { RefreshIndicator, StaleRegion } from "@/components/ui/stale";
import { Skeleton, KpiSkeleton, TableSkeleton } from "@/components/ui/skeleton";

interface OverdueCompany {
  id: string;
  name: string;
  sector: string | null;
  daysSinceUpdate: number | null;
  lastReminderSentAt: string | null;
  // Part 45: false for a company with no founder member (Remind can reach nobody).
  hasFounder?: boolean;
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

export default function AdminDashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const authed = sessionStatus === "authenticated";
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
  // New look (WS161): the same items, grouped for the inbox.
  const inboxRows = useMemo(
    () => buildInboxRows(attention, { alerts, overdue: dashboard?.overdueCompanies ?? [] }),
    [attention, alerts, dashboard]
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

  if (sessionStatus === "loading" || loading) {
    return (
      <AppShell width="full">
        <div className="space-y-6"><Skeleton className="h-7 w-56" /><KpiSkeleton /><TableSkeleton rows={4} cols={4} /></div>
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

  // The chart and the sector list.
  function renderCharts(className: string) {
    return (
      <div className={className}>
        {/* Updates per month bar chart */}
        <Card className="lg:col-span-2 v2:rounded-lg v2:border-0 v2:bg-card v2:shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Updates Published — Last 6 Months</CardTitle>
          </CardHeader>
          <CardContent>
            {d.updatesByMonth.every((m) => m.count === 0) ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No published updates yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={d.updatesByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  {/* Hairline horizontal gridlines only, no dashes (audit #15). */}
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
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
        <Card className="v2:rounded-lg v2:border-0 v2:bg-card v2:shadow-none">
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
    );
  }

  const welcome = `Welcome back${session?.user?.name ? `, ${session.user.name}` : ""}. Here is what needs you today.`;

  // "Needs you" (PLAN-1, WS161): an inbox of what is waiting on the team, with the portfolio numbers
  // and the chart below it.
  const stats = [
    { label: "Companies", value: d.totalCompanies },
    { label: "Updates this month", value: d.updatesThisMonth },
    { label: "Behind on updates", value: d.companiesOverdue },
    { label: "Awaiting approval", value: d.pendingApprovals },
  ];
  return (
    <AppShell width="full">
      <PageHeader title="Needs you" description={welcome} indicator={<RefreshIndicator active={refreshing} />} />

      <StaleRegion refreshing={refreshing}>
        {attention.length === 0 ? (
          <div className="mx-[var(--row-pad)] max-w-[var(--column-wide)]">
            <EmptyState
              title="Nothing needs you right now."
              description="When someone signs up or an update runs late, it shows here."
            />
          </div>
        ) : (
          <NeedsYouInbox
            rows={inboxRows}
            counts={{ approvals: d.pendingApprovals, diligence: queues.diligence, board: queues.boardReview }}
            alerts={alerts}
            overdue={d.overdueCompanies}
            remindedAt={remindedAt}
            reminding={reminding}
            onRemind={(id) => {
              if (!reminding[id]) void sendReminder(id);
            }}
            onDismiss={(id) => void dismissAlert(id, null)}
            rowClassName={(id) => rowCollapse.className(id, "fade")}
          />
        )}

        <section aria-labelledby="portfolio-heading" className="mx-[var(--row-pad)] mt-12 max-w-[var(--column-wide)] pb-12">
          <h2 id="portfolio-heading" className="mb-3 text-meta font-medium text-muted-foreground">
            Portfolio
          </h2>
          <dl aria-label="Portfolio totals" className="grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
            {stats.map((k) => (
              <Stat key={k.label} semantic label={k.label} value={k.value} />
            ))}
          </dl>
          {renderCharts("mt-4 grid gap-4 lg:grid-cols-3")}
        </section>
      </StaleRegion>
    </AppShell>
  );
}
