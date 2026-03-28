"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Building2,
  Clock,
  FileText,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Bell,
} from "lucide-react";
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

export default function AdminDashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOverdue, setShowOverdue] = useState(false);
  const [reminding, setReminding] = useState<Record<string, boolean>>({});
  const [remindedAt, setRemindedAt] = useState<Record<string, string>>({});

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    async function fetchData() {
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Server error (${res.status})`);
        }
        const data = await res.json();
        setDashboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [sessionStatus]);

  if (sessionStatus === "loading" || loading) {
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

  const d = dashboard!;

  async function sendReminder(companyId: string) {
    setReminding((prev) => ({ ...prev, [companyId]: true }));
    try {
      const res = await fetch(`/api/companies/${companyId}/remind`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRemindedAt((prev) => ({ ...prev, [companyId]: data.lastReminderSentAt }));
      }
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
        description={`Welcome back${session?.user?.name ? `, ${session.user.name}` : ""}. Here's your portfolio overview.`}
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Total Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{d.totalCompanies}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{d.pendingApprovals}</p>
            {d.pendingApprovals > 0 && (
              <Link href="/admin/approvals" className="text-sm text-primary hover:underline">
                Review now
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Updates This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{d.updatesThisMonth}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Companies Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{d.companiesOverdue}</p>
            <p className="text-xs text-muted-foreground">Behind on updates</p>
          </CardContent>
        </Card>
      </div>

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
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [v, "Updates"]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: "6px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
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

      {/* Overdue companies */}
      {d.overdueCompanies.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowOverdue((v) => !v)}
            >
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Companies Needing Attention
                <Badge variant="warning">{d.overdueCompanies.length}</Badge>
              </CardTitle>
              {showOverdue ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showOverdue && (
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Company</th>
                    <th className="pb-2 font-medium">Sector</th>
                    <th className="pb-2 font-medium">Days Since Update</th>
                    <th className="pb-2 font-medium">Last Reminded</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {d.overdueCompanies.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/admin/companies/${c.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-2 text-muted-foreground">{c.sector ?? "—"}</td>
                      <td className="py-2">
                        {c.daysSinceUpdate !== null ? (
                          <span className={c.daysSinceUpdate > 60 ? "font-semibold text-destructive" : "text-amber-600"}>
                            {c.daysSinceUpdate}d
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {(() => {
                          const ts = remindedAt[c.id] ?? c.lastReminderSentAt;
                          return ts ? timeAgo(ts) : "—";
                        })()}
                      </td>
                      <td className="py-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={reminding[c.id]}
                          onClick={() => sendReminder(c.id)}
                          className="flex items-center gap-1"
                        >
                          <Bell className="h-3 w-3" />
                          {reminding[c.id] ? "Sending…" : "Remind"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>
      )}
    </AppShell>
  );
}
