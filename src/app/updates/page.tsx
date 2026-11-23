"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FileText, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatPeriod } from "@/lib/utils";
import { useCompany } from "@/context/company-context";
import { PageSkeleton } from "@/components/ui/skeleton";
import { V2_UNBOX } from "@/lib/founder-look";

interface Update {
  id: string;
  title: string;
  period: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
  scheduledFor: string | null;
}

export default function UpdatesPage() {
  const router = useRouter();
  const { selectedCompany, loading: companyLoading } = useCompany();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (companyLoading) return;

    async function load() {
      try {
        if (!selectedCompany) {
          setLoading(false);
          return;
        }
        const res = await fetch(`/api/companies/${selectedCompany.id}/updates`);
        if (res.ok) {
          const data = await res.json();
          setUpdates(data.data ?? data ?? []);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [companyLoading, selectedCompany?.id]);

  async function handleDelete(updateId: string) {
    setDeletingId(updateId);
    try {
      const res = await fetch(`/api/updates/${updateId}`, { method: "DELETE" });
      if (res.ok) {
        setUpdates((prev) => prev.filter((u) => u.id !== updateId));
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (!selectedCompany) {
    return (
      <AppShell>
        <PageHeader title="Updates" />
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No company found"
          description="Please complete the setup wizard first."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Updates"
        description="Keep your investors in the loop with regular updates."
        action={
          <Button onClick={() => router.push("/updates/new")}>
            <Plus className="mr-2 h-4 w-4" />
            New Update
          </Button>
        }
      />

      {updates.length === 0 ? (
        <EmptyState eyebrow="Updates"
          icon={<FileText className="h-10 w-10" />}
          title="No updates yet"
          description="Share your first update to keep your investors in the loop."
          action={
            <Button onClick={() => router.push("/updates/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first update
            </Button>
          }
        />
      ) : (
        // New look: hairline rows, not cards. Desktop: one 44px line (title, period and date, status);
        // phones: two lines, 64 min.
        <div className="space-y-2 v2:space-y-0 v2:divide-y v2:divide-row-divider v2:border-y v2:border-row-divider">
          {updates.map((update) => (
            <Card key={update.id} className={`card-lift transition-colors hover:bg-muted/50 ${V2_UNBOX} v2:hover:translate-y-0 v2:hover:bg-row-hover`}>
              <CardContent className="flex items-center justify-between py-3 v2:min-h-11 v2:py-0 max-md:v2:min-h-16 max-md:v2:py-3">
                <Link href={`/updates/${update.id}`} className="min-w-0 flex-1 md:v2:flex md:v2:items-center md:v2:gap-6 max-md:v2:py-1">
                  <p className="truncate font-medium v2:text-row md:v2:min-w-0 md:v2:flex-1">{update.title}</p>
                  <p className="text-sm text-muted-foreground v2:text-row v2:text-secondary md:v2:shrink-0 max-md:v2:mt-1 max-md:v2:text-meta max-md:v2:text-muted-foreground">
                    {formatPeriod(update.period)} &middot;{" "}
                    {formatDate(update.createdAt)}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0 ml-3 v2:ml-6">
                  <Badge variant={update.status === "SENT" ? "success" : "warning"}>
                    {update.status === "SENT"
                      ? "Published"
                      : update.scheduledFor
                        ? `Scheduled · ${formatDate(update.scheduledFor)}`
                        : "Draft"}
                  </Badge>
                  {update.status === "DRAFT" && (
                    <button
                      onClick={() => handleDelete(update.id)}
                      disabled={deletingId === update.id}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50 v2:grid v2:h-8 v2:w-8 v2:place-items-center v2:p-0 v2:hover:bg-row-hover max-md:v2:h-11 max-md:v2:w-11 max-md:v2:-mr-3"
                      title="Delete draft"
                      aria-label="Delete draft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
