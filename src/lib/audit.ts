import { db } from "@/lib/db";

/**
 * Record an admin action. Never throws — audit logging must not
 * break the action being logged.
 */
export async function logAdminAction(
  actor: { id?: string; email?: string | null },
  action: string,
  opts: { targetType?: string; targetId?: string; metadata?: Record<string, unknown> } = {}
) {
  try {
    await db.auditLog.create({
      data: {
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? "unknown",
        action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        metadata: opts.metadata as any,
      },
    });
  } catch (err) {
    console.error("audit log write failed:", err);
  }
}
