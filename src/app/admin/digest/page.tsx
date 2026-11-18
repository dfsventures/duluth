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
import { PageSkeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useNewLook } from "@/lib/use-new-look";

interface DigestSummary {
  id: string;
  title: string;
  weekOf: string;
  sentAt: string | null;
  source?: string;
  createdAt: string;
  todos: { completed: boolean }[];
}

// New look (WS169): one-line rows in the shared table. The old look keeps its cards below.
function todoCounts(d: DigestSummary) {
  return { total: d.todos.length, done: d.todos.filter((t) => t.completed).length };
}

const digestColumns: DataTableColumn<DigestSummary>[] = [
  { key: "title", header: "Title", sortValue: (d) => d.title, cell: (d) => d.title },
  {
    key: "week",
    header: "Week of",
    sortValue: (d) => new Date(d.weekOf).getTime(),
    firstDir: "desc",
    mobile: "meta",
    className: "whitespace-nowrap text-muted-foreground",
    exportValue: (d) => formatDate(d.weekOf),
    cell: (d) => formatDate(d.weekOf),
  },
  {
    key: "status",
    header: "Status",
    sortValue: (d) => (d.sentAt ? "Sent" : "Draft"),
    mobile: "badge",
    exportValue: (d) => (d.sentAt ? "Sent" : "Draft"),
    title: (d) => `${d.sentAt ? "Sent" : "Draft"}${d.source === "GRANOLA" ? " · From Granola" : ""}`,
    cell: (d) => (
      <>
        <Badge variant={d.sentAt ? "success" : "warning"}>{d.sentAt ? "Sent" : "Draft"}</Badge>
        {d.source === "GRANOLA" && <span className="ml-2 text-muted-foreground">From Granola</span>}
      </>
    ),
  },
  {
    key: "todos",
    header: "To-dos",
    align: "num",
    sortValue: (d) => todoCounts(d).total,
    firstDir: "desc",
    exportValue: (d) => (todoCounts(d).total > 0 ? `${todoCounts(d).done} of ${todoCounts(d).total}` : ""),
    cell: (d) => {
      const { total, done } = todoCounts(d);
      return total > 0 ? `${done} of ${total}` : "";
    },
  },
];

export default function DigestListPage() {
  const { status: sessionStatus } = useSession();
  const newLook = useNewLook();
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
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell width="wide">
      <PageHeader
        title="Weekly Digest"
        description="AI-generated weekly summaries from your Granola meetings."
        action={
          newLook ? (
            // New look: the link itself is the button (no button inside a link).
            <Link href="/admin/digest/new" className="btn-primary">
              <Plus className="h-4 w-4" />
              New Digest
            </Link>
          ) : (
            <Link href="/admin/digest/new">
              <Button size="sm" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New Digest
              </Button>
            </Link>
          )
        }
      />

      {newLook ? (
        <DataTable<DigestSummary>
          label="Weekly digests"
          noun="digest"
          rows={digests}
          rowKey={(d) => d.id}
          columns={digestColumns}
          rowHref={(d) => `/admin/digest/${d.id}`}
          defaultSort={{ key: "week", dir: "desc" }}
          searchText={(d) => [d.title]}
          searchPlaceholder="Filter digests"
          minWidth={640}
          empty={
            <EmptyState eyebrow="Weekly Digest"
              icon={<BookOpen className="h-8 w-8" />}
              title="No digests yet"
              description="Ask Claude to generate this week's digest from your Granola meetings."
            />
          }
        />
      ) : digests.length === 0 ? (
        <EmptyState eyebrow="Weekly Digest"
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
                      {d.source === "GRANOLA" && <Badge variant="info">From Granola</Badge>}
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
