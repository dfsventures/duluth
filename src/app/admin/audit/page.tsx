import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { ScrollText } from "lucide-react";

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Part 32, WS87 (D3) — pretty-print the metadata object in place as
// `key: value · key: value` pairs instead of raw JSON, with the full
// object one click away behind a native <details> (no client component;
// this page stays a Server Component, same reasoning as JC-UI-B). A
// per-action summary map was considered and rejected: `action` is
// deliberately a free string (logAdminAction accepts anything), and a
// map would put a maintenance obligation on every future Part that logs
// a new action.
function truncateValue(value: string, max = 40): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function MetadataCell({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return <span className="text-muted-foreground">—</span>;
  }

  const entries = Object.entries(metadata as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined
  );

  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <details>
      <summary className="cursor-pointer list-none text-xs [&::-webkit-details-marker]:hidden">
        {entries.map(([key, value], i) => (
          <span key={key}>
            {i > 0 && <span className="text-muted-foreground"> · </span>}
            <span className="font-mono text-muted-foreground">{key}:</span>{" "}
            {truncateValue(typeof value === "object" ? JSON.stringify(value) : String(value))}
          </span>
        ))}
      </summary>
      <pre className="mt-1.5 max-w-md whitespace-pre-wrap break-words rounded-sm border border-border bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </details>
  );
}

export default async function AuditLogPage() {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN")) {
    redirect("/login");
  }

  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AppShell>
      <PageHeader
        title="Audit Log"
        description="The last 100 admin actions taken on this platform."
      />

      {logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title="No admin actions yet"
          description="Actions like approvals, deletions, and setting changes will appear here."
        />
      ) : (
        <Table tableClassName="min-w-[880px] text-left">
          <TableHead>
            <Th>Time</Th>
            <Th>Actor</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>Details</Th>
          </TableHead>
          <tbody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatTimestamp(log.createdAt)}
                </td>
                <td className="px-4 py-3">{log.actorEmail}</td>
                <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {log.targetType ? `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ""}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <MetadataCell metadata={log.metadata} />
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </AppShell>
  );
}
