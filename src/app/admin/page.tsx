"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Building2,
  Clock,
  FileText,
  AlertTriangle,
  Search,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, daysSince } from "@/lib/utils";

interface DashboardData {
  totalCompanies: number;
  pendingApprovals: number;
  updatesThisMonth: number;
  companiesOverdue: number;
}

interface CompanyCadence {
  id: string;
  name: string;
  sector: string | null;
  lastUpdate: string | null;
}

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [companies, setCompanies] = useState<CompanyCadence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) throw new Error("Failed to load dashboard data");
        const data = await res.json();

        setDashboard({
          totalCompanies: data.totalCompanies ?? 0,
          pendingApprovals: data.pendingApprovals ?? 0,
          updatesThisMonth: data.updatesThisMonth ?? 0,
          companiesOverdue: data.companiesOverdue ?? 0,
        });
        setCompanies(data.companies ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

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

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  function getStatusBadge(lastUpdate: string | null) {
    if (!lastUpdate) {
      return <Badge variant="danger">No updates</Badge>;
    }
    const days = daysSince(lastUpdate);
    if (days > 90) {
      return <Badge variant="danger">Overdue</Badge>;
    }
    if (days > 30) {
      return <Badge variant="warning">Aging</Badge>;
    }
    return <Badge variant="success">Current</Badge>;
  }

  function getDaysText(lastUpdate: string | null) {
    if (!lastUpdate) return "N/A";
    const days = daysSince(lastUpdate);
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  return (
    <AppShell>
      <PageHeader
        title="Admin Dashboard"
        description={`Welcome back${session?.user?.name ? `, ${session.user.name}` : ""}. Here's your portfolio overview.`}
      />

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Total Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{dashboard?.totalCompanies ?? 0}</p>
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
            <p className="text-2xl font-semibold">{dashboard?.pendingApprovals ?? 0}</p>
            {(dashboard?.pendingApprovals ?? 0) > 0 && (
              <Link
                href="/admin/approvals"
                className="text-sm text-primary hover:underline"
              >
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
            <p className="text-2xl font-semibold">{dashboard?.updatesThisMonth ?? 0}</p>
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
            <p className="text-2xl font-semibold">{dashboard?.companiesOverdue ?? 0}</p>
            <p className="text-xs text-muted-foreground">No update in 90+ days</p>
          </CardContent>
        </Card>
      </div>

      {/* Update cadence section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Update Cadence</h2>
          <div className="w-64">
            <Input
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredCompanies.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? "No companies match your search." : "No companies found."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Company Name</th>
                      <th className="px-4 py-3 font-medium">Sector</th>
                      <th className="px-4 py-3 font-medium">Last Update</th>
                      <th className="px-4 py-3 font-medium">Days Since Update</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map((company) => (
                      <tr
                        key={company.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/companies/${company.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {company.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {company.sector ?? "N/A"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {company.lastUpdate
                            ? formatDate(company.lastUpdate)
                            : "Never"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {getDaysText(company.lastUpdate)}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(company.lastUpdate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
