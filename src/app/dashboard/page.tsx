"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Building2, FileText, AlertCircle, Eye } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { useCompany } from "@/context/company-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, daysSince } from "@/lib/utils";
import { nextFounderAction } from "@/lib/next-action";
import { PageSkeleton } from "@/components/ui/skeleton";

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
  // Part 18, WS44 (F36, Q61/Q62) — already returned by the API today,
  // just untyped client-side until now.
  completedAt: string | null;
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

  // One next action, leading the page. The old diligence banner is folded into it.
  const next = nextFounderAction({
    stage: company.stage,
    diligence: diligence
      ? { done: diligence.progress.done, total: diligence.progress.total, completed: Boolean(diligence.completedAt) }
      : null,
    updates,
    daysSinceLastUpdate,
  });

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${session?.user?.name ? `, ${session.user.name}` : ""}.`}
      />

      {/* Next action: the one thing to do, with one button. */}
      <section
        aria-labelledby="next-action-heading"
        className={`card mb-8 flex flex-wrap items-center justify-between gap-4 ${
          next.tone === "act" ? "border-l-2 border-l-sky" : ""
        }`}
      >
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">
            {next.tone === "act" ? "Next step" : "All clear"}
          </p>
          <h2 id="next-action-heading" className="mt-1 font-display text-title text-foreground">
            {next.headline}
          </h2>
          {next.detail && <p className="mt-1 text-body text-secondary">{next.detail}</p>}
        </div>
        {next.tone === "act" ? (
          <Button size="lg" onClick={() => router.push(next.href)}>
            {next.cta}
          </Button>
        ) : (
          <Button size="lg" variant="secondary" onClick={() => router.push(next.href)}>
            {next.cta}
          </Button>
        )}
      </section>

      {/* Quiet stat strip: company, updates, last update, investor views */}
      <dl
        aria-label="Company at a glance"
        className="mb-10 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 lg:grid-cols-4"
      >
        <div className="min-w-0">
          <dt className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">Company</dt>
          <dd className="mt-0.5 truncate font-display text-lg font-semibold">{company.name}</dd>
          <p className="truncate text-sm text-muted-foreground">
            {company.sector ?? "No sector set"}
            {company.geography ? ` \u00B7 ${company.geography}` : ""}
          </p>
        </div>
        <div>
          <dt className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">Updates</dt>
          <dd className="mt-0.5 font-display text-lg font-semibold">{updates.length}</dd>
          <p className="text-sm text-muted-foreground">{updates.length === 1 ? "update" : "updates"} submitted</p>
        </div>
        <div>
          <dt className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">Last update</dt>
          <dd className="mt-0.5 font-display text-lg font-semibold">
            {lastUpdateDate ? formatDate(lastUpdateDate) : "None yet"}
          </dd>
          <p className="text-sm text-muted-foreground">
            {daysSinceLastUpdate !== null
              ? `${daysSinceLastUpdate} day${daysSinceLastUpdate === 1 ? "" : "s"} ago`
              : "No updates sent"}
          </p>
        </div>
        <div>
          <dt className="font-mono text-label font-semibold uppercase tracking-label text-muted-foreground">Investor views</dt>
          <dd className="mt-0.5 font-display text-lg font-semibold">{engagement.totalViews}</dd>
          <p className="text-sm text-muted-foreground">
            {engagement.recentViews[0]
              ? `Last viewed ${formatDate(engagement.recentViews[0].viewedAt)}`
              : "No views yet"}
          </p>
        </div>
      </dl>

      {/* Recent updates */}
      <section aria-labelledby="recent-updates-heading" className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="recent-updates-heading" className="font-display text-heading text-foreground">
            Recent updates
          </h2>
          {updates.length > 0 && (
            <Link href="/updates" className="text-sm text-primary underline-offset-4 hover:underline">
              All updates
            </Link>
          )}
        </div>
        {updates.length === 0 ? (
          <EmptyState
            eyebrow="Updates"
            icon={<FileText className="h-8 w-8" />}
            title="No updates yet"
            description="Your investors see what you write here. Start with a short note on the quarter."
            action={<Button onClick={() => router.push("/updates/new")}>Write an update</Button>}
          />
        ) : (
          <ul className="divide-y divide-row-divider border border-border bg-card">
            {updates.map((update) => (
              <li key={update.id}>
                <Link
                  href={`/updates/${update.id}`}
                  className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{update.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {update.period} &middot; {formatDate(update.createdAt)}
                    </span>
                  </span>
                  <Badge variant={update.status === "SENT" ? "success" : "warning"}>
                    {update.status === "SENT" ? "Sent" : "Draft"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent investor activity */}
      <section aria-labelledby="investor-activity-heading">
        <h2 id="investor-activity-heading" className="mb-3 font-display text-heading text-foreground">
          Recent investor activity
        </h2>
        {engagement.recentViews.length === 0 ? (
          <EmptyState
            eyebrow="Investor links"
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
          <ul className="divide-y divide-row-divider border border-border bg-card">
            {engagement.recentViews.map((view) => (
              <li key={view.id} className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{view.email}</p>
                  <p className="text-sm text-muted-foreground">{view.link.label ?? "Investor link"}</p>
                </div>
                <p className="shrink-0 text-sm text-muted-foreground">{formatDate(view.viewedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
