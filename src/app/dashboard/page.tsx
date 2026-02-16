"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus,
  Pencil,
  BarChart3,
  Building2,
  FileText,
  Clock,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, daysSince } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
  logo: string | null;
  sector: string | null;
  geography: string | null;
  fundingStage: string | null;
  description: string | null;
}

interface Update {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [company, setCompany] = useState<Company | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/companies");
        if (!res.ok) throw new Error("Failed to load company data");
        const data = await res.json();

        const companies = data.data ?? data;
        if (!companies || companies.length === 0) {
          setCompany(null);
          setLoading(false);
          return;
        }

        const comp = companies[0];
        setCompany(comp);

        const updatesRes = await fetch(
          `/api/companies/${comp.id}/updates?limit=5`
        );
        if (updatesRes.ok) {
          const updatesData = await updatesRes.json();
          setUpdates(updatesData.data ?? updatesData ?? []);
        }
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

  if (!company) {
    return (
      <AppShell>
        <PageHeader
          title="Dashboard"
          description="Welcome to the DFS Lab portfolio platform."
        />
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="Complete your setup"
          description="You haven't set up your company profile yet. Complete the setup wizard to get started."
          action={
            <Button onClick={() => router.push("/setup-wizard")}>
              Get Started
            </Button>
          }
        />
      </AppShell>
    );
  }

  const lastUpdateDate =
    updates.length > 0 ? updates[0].createdAt : null;
  const daysSinceLastUpdate = lastUpdateDate
    ? daysSince(lastUpdateDate)
    : null;

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${session?.user?.name ? `, ${session.user.name}` : ""}.`}
        action={
          <Button onClick={() => router.push("/updates/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Update
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Company
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{company.name}</p>
            <p className="text-sm text-muted-foreground">
              {company.sector ?? "No sector set"}
              {company.geography ? ` \u00B7 ${company.geography}` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Updates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{updates.length}</p>
            <p className="text-sm text-muted-foreground">
              {updates.length === 1 ? "update" : "updates"} submitted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              Last Update
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {lastUpdateDate ? formatDate(lastUpdateDate) : "None yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {daysSinceLastUpdate !== null
                ? `${daysSinceLastUpdate} day${daysSinceLastUpdate === 1 ? "" : "s"} ago`
                : "No updates sent"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Button onClick={() => router.push("/updates/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Update
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push("/company/profile")}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit Profile
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push("/company/metrics")}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          View Metrics
        </Button>
      </div>

      {/* Recent updates */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Recent Updates</h2>
        {updates.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title="No updates yet"
            description="Create your first update to share progress with DFS Lab."
            action={
              <Button
                variant="secondary"
                onClick={() => router.push("/updates/new")}
              >
                Create Update
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {updates.map((update) => (
              <Link
                key={update.id}
                href={`/updates/${update.id}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{update.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {update.period} &middot; {formatDate(update.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        update.status === "SENT" ? "success" : "warning"
                      }
                    >
                      {update.status === "SENT" ? "Sent" : "Draft"}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
