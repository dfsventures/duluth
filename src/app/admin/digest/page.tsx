"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BookOpen, AlertCircle, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

interface DigestSummary {
  id: string;
  title: string;
  weekOf: string;
  sentAt: string | null;
  source?: string;
  createdAt: string;
  todos: { completed: boolean }[];
}

// WS169: one-line rows in the shared table.
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
      <AppShell width="wide">
        <PageSkeleton />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell width="wide">
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
          // The link itself is the button (no button inside a link).
          <Link href="/admin/digest/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            New Digest
          </Link>
        }
      />

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
    </AppShell>
  );
}
