"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BookOpen, CheckCircle2, Clock, AlertCircle, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

interface DigestSummary {
  id: string;
  title: string;
  weekOf: string;
  sentAt: string | null;
  createdAt: string;
  todos: { completed: boolean }[];
}

export default function DigestListPage() {
  const { status: sessionStatus } = useSession();
  const [digests, setDigests] = useState<DigestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    fetch("/api/admin/digest")
      .then((r) => r.json())
      .then(setDigests)
      .catch(() => setError("Failed to load digests"))
      .finally(() => setLoading(false));
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
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Weekly Digest"
        description="AI-generated weekly summaries from your Granola meetings."
        action={
          <Link href="/admin/digest/new">
            <Button size="sm" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Digest
            </Button>
          </Link>
        }
      />

      {digests.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title="No digests yet"
          description="Ask Claude to generate this week's digest from your Granola meetings."
        />
      ) : (
        <div className="space-y-4">
          {digests.map((d) => {
            const total = d.todos.length;
            const done = d.todos.filter((t) => t.completed).length;
            return (
              <Card key={d.id} className="hover:border-primary/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-48 flex-1">
                      <CardTitle className="text-base font-semibold truncate">{d.title}</CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Week of {formatDate(d.weekOf)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {d.sentAt ? (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Sent
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Draft
                        </Badge>
                      )}
                      <Link href={`/admin/digest/${d.id}`}>
                        <Button size="sm" variant="secondary">View</Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                {total > 0 && (
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      {done}/{total} todos completed
                    </p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
