import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AuditLook } from "./audit-table";

// Sign-in events are recorded by src/lib/signin-audit.ts. Other actions are free strings (logAdminAction
// accepts anything); audit-table.tsx gives the known ones readable labels.

const FILTERS = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admin actions" },
  { key: "signin", label: "Sign-ins" },
  { key: "failed", label: "Failed sign-ins" },
  { key: "marge", label: "Via Marge" }, // Part 39 (WS123.4)
] as const;

// Part 39 (WS123.4): rows Marge acted on behalf of someone for carry metadata.via = "marge".
const VIA_MARGE = { metadata: { path: ["via"], equals: "marge" } };

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
          : filter === "marge"
            ? VIA_MARGE
            : {};

  const signinWhere = { action: { startsWith: "SIGN_IN_" } };
  const [logs, signinCount, failedCount, margeCount, totalCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.auditLog.count({ where: signinWhere }),
    db.auditLog.count({ where: { action: "SIGN_IN_FAILED" } }),
    db.auditLog.count({ where: VIA_MARGE }),
    db.auditLog.count(),
  ]);
  const counts: Record<string, number> = {
    all: totalCount,
    admin: totalCount - signinCount,
    signin: signinCount,
    failed: failedCount,
    marge: margeCount,
  };

  return (
    <AppShell width="wide">
      <PageHeader
        title="Audit Log"
        description="The last 100 matching events: admin actions and sign-in attempts."
      />
      <AuditLook
        rows={logs.map((log) => ({
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          actorEmail: log.actorEmail,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          metadata: log.metadata,
        }))}
        counts={counts}
        filters={FILTERS}
        filter={filter}
      />
    </AppShell>
  );
}
