import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
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

function formatMetadata(metadata: unknown): string {
  if (!metadata) return "";
  const str = JSON.stringify(metadata);
  return str.length > 120 ? `${str.slice(0, 120)}…` : str;
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
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatTimestamp(log.createdAt)}
                  </td>
                  <td className="px-4 py-3">{log.actorEmail}</td>
                  <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {log.targetType ? `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {formatMetadata(log.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
