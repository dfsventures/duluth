import { db } from "@/lib/db";
import type { BroadcastSender } from "@/lib/email";

/** Name and email of an admin, for a broadcast's From and Reply-To. */
export async function senderFor(userId: string | null | undefined): Promise<BroadcastSender | null> {
  if (!userId) return null;
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return u ? { name: u.name, email: u.email } : null;
}

/**
 * Who published a broadcast. There is no publisher column, so this reads the
 * BROADCAST_PUBLISHED audit entry; a broadcast without one falls back to its author.
 */
export async function publisherIdOf(broadcast: { id: string; createdById: string }): Promise<string> {
  const entry = await db.auditLog.findFirst({
    where: { action: "BROADCAST_PUBLISHED", targetType: "CompanyBroadcast", targetId: broadcast.id },
    orderBy: { createdAt: "asc" },
    select: { actorId: true },
  });
  return entry?.actorId ?? broadcast.createdById;
}

/** Display label for a person: name, else email. */
function label(u: { name: string | null; email: string } | undefined): string | null {
  return u ? u.name?.trim() || u.email : null;
}

/**
 * "By" labels for a list of broadcasts: the publisher for sent ones (from the
 * audit log), the author for drafts. One query for each of audit and users.
 */
export async function senderLabels(
  broadcasts: { id: string; status: string; createdById: string }[]
): Promise<Record<string, string | null>> {
  const sentIds = broadcasts.filter((b) => b.status === "PUBLISHED").map((b) => b.id);
  const entries = sentIds.length
    ? await db.auditLog.findMany({
        where: { action: "BROADCAST_PUBLISHED", targetType: "CompanyBroadcast", targetId: { in: sentIds } },
        orderBy: { createdAt: "asc" },
        select: { targetId: true, actorId: true },
      })
    : [];
  const publisher = new Map<string, string>();
  for (const e of entries) if (e.targetId && e.actorId && !publisher.has(e.targetId)) publisher.set(e.targetId, e.actorId);
  const userIds = Array.from(new Set(broadcasts.map((b) => publisher.get(b.id) ?? b.createdById)));
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return Object.fromEntries(broadcasts.map((b) => [b.id, label(byId.get(publisher.get(b.id) ?? b.createdById))]));
}
