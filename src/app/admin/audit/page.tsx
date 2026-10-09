import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHead, Th, TableRow } from "@/components/ui/table";
import { ScrollText } from "lucide-react";
import Link from "next/link";

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
// Sign-in events are recorded by src/lib/signin-audit.ts. Other actions are
// free strings and shown as-is; only these get a friendly label.
const ACTION_LABELS: Record<string, string> = {
  SIGN_IN_SUCCEEDED: "Sign-in succeeded",
  SIGN_IN_FAILED: "Sign-in failed",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admin actions" },
  { key: "signin", label: "Sign-ins" },
  { key: "failed", label: "Failed sign-ins" },
] as const;

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

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN")) {
    redirect("/login");
  }

  const filter = FILTERS.some((f) => f.key === searchParams?.filter) ? searchParams!.filter! : "all";
  const where =
    filter === "admin"
      ? { NOT: { action: { startsWith: "SIGN_IN_" } } }
      : filter === "signin"
        ? { action: { startsWith: "SIGN_IN_" } }
        : filter === "failed"
          ? { action: "SIGN_IN_FAILED" }
          : {};

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AppShell>
      <PageHeader
        title="Audit Log"
        description="The last 100 matching events: admin actions and sign-in attempts."
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/audit" : `/admin/audit?filter=${f.key}`}
            className={`rounded-sm border px-3 py-1 ${
              filter === f.key ? "border-foreground font-medium" : "border-border text-muted-foreground"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title="No matching events"
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
                <td className="px-4 py-3">
                  {ACTION_LABELS[log.action] && <div>{ACTION_LABELS[log.action]}</div>}
                  <div className="font-mono text-xs text-muted-foreground">{log.action}</div>
                </td>
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
