"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Building2,
  FileText,
  Clock,
  AlertCircle,
  Eye,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { useCompany } from "@/context/company-context";
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
  // Part 16, WS40 — "DILIGENCE" | "ACTIVE".
  stage?: string;
}

interface DiligenceSummary {
  progress: { done: number; total: number };
}

interface Update {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
}

interface EngagementView {
  id: string;
  email: string;
  viewedAt: string;
  link: { label: string | null };
}

interface Engagement {
  totalViews: number;
  recentViews: EngagementView[];
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [company, setCompany] = useState<Company | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [engagement, setEngagement] = useState<Engagement>({ totalViews: 0, recentViews: [] });
  const [diligence, setDiligence] = useState<DiligenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || companyLoading) return;

    async function fetchData() {
      try {
        if (!selectedCompany) {
          setCompany(null);
          setLoading(false);
          return;
        }

        setCompany(selectedCompany as Company);

        const updatesRes = await fetch(
          `/api/companies/${selectedCompany.id}/updates?limit=5`
        );
        if (updatesRes.ok) {
          const updatesData = await updatesRes.json();
          setUpdates(updatesData.data ?? updatesData ?? []);
        }

        // Investor engagement is a nice-to-have — never block the dashboard on it
        try {
          const engagementRes = await fetch(
            `/api/companies/${selectedCompany.id}/engagement`
          );
          if (engagementRes.ok) {
            setEngagement(await engagementRes.json());
          }
        } catch {
          // leave engagement at its zero default
        }

        // Part 16, WS40 (Q55) — non-blocking DD banner. Only fetched for
        // DILIGENCE-stage companies; a no-op for every other company.
        if ((selectedCompany as Company).stage === "DILIGENCE") {
          try {
            const diligenceRes = await fetch(
              `/api/companies/${selectedCompany.id}/diligence`
            );
            if (diligenceRes.ok) {
              setDiligence(await diligenceRes.json());
            }
          } catch {
            // non-fatal — the banner just doesn't render progress detail
          }
        } else {
          setDiligence(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [sessionStatus, companyLoading, selectedCompany?.id]);

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

  if (!company) {
    return (
      <AppShell>
        <PageHeader
          title="Dashboard"
          description="Welcome to the Molly portfolio platform."
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
      />

      {/* Part 16, WS40 (Q55) — persistent, non-blocking DD banner.
          Every section below renders completely unchanged regardless. */}
      {company.stage === "DILIGENCE" && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium">Due diligence — a few more steps</p>
              <p className="text-sm text-muted-foreground">
                {diligence
                  ? `${diligence.progress.done} of ${diligence.progress.total} required items done`
                  : "Documents and a couple of quick questions before we close."}
              </p>
            </div>
            <Button onClick={() => router.push("/diligence")}>Continue</Button>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Eye className="h-4 w-4" />
              Investor Views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{engagement.totalViews}</p>
            <p className="text-sm text-muted-foreground">
              {engagement.recentViews[0]
                ? `Last viewed ${formatDate(engagement.recentViews[0].viewedAt)}`
                : "No views yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent investor activity */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Recent Investor Activity</h2>
        {engagement.recentViews.length === 0 ? (
          <EmptyState
            icon={<Eye className="h-8 w-8" />}
            title="No investor views yet"
            description="Create a link on the Investor Links page to share your updates."
            action={
              <Button variant="secondary" onClick={() => router.push("/links")}>
                Go to Investor Links
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {engagement.recentViews.map((view) => (
              <Card key={view.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{view.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {view.link.label ?? "Investor link"}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-muted-foreground">
                    {formatDate(view.viewedAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recent updates */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Recent Updates</h2>
        {updates.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title="No updates yet"
            description="Head to Updates in the sidebar to create your first update."
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
