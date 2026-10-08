// Part 37 (WS106.3) — db-touching board helpers. Server only.
import { db } from "@/lib/db";
import { positionBetween, needsRenormalize, POSITION_STEP, type BoardStatus } from "@/lib/board";
import type { Canonical } from "@/lib/board-reconcile";

/** Upserts a BoardPerson for every ADMIN user that lacks one. */
export async function ensureAdminPeople(): Promise<void> {
  const admins = await db.user.findMany({
    where: { roles: { has: "ADMIN" }, boardPerson: null },
    select: { id: true, name: true, email: true },
  });
  for (const a of admins) {
    await db.boardPerson.upsert({
      where: { userId: a.id },
      create: { userId: a.id, displayName: a.name ?? a.email },
      update: {},
    });
  }
}

/** Canonical people/projects (with normalized aliases) plus open cards, for the extraction prompt. */
export async function loadBoardContext() {
  const [people, projects, aliases, openCards] = await Promise.all([
    db.boardPerson.findMany({
      where: { archivedAt: null },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.boardProject.findMany({ where: { archivedAt: null } }),
    db.boardAlias.findMany(),
    db.boardCard.findMany({
      where: { archivedAt: null, status: { not: "DONE" } },
      select: {
        id: true,
        title: true,
        status: true,
        ownerId: true,
        projectId: true,
        sourceKey: true,
        humanEditedAt: true,
        dueDate: true,
      },
    }),
  ]);

  const personCanon: Canonical[] = people.map((p) => ({
    id: p.id,
    name: p.user?.name ?? p.displayName,
    email: p.user?.email ?? null,
    aliases: aliases.filter((a) => a.kind === "PERSON" && a.personId === p.id).map((a) => a.normalized),
  }));
  const projectCanon: Canonical[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    aliases: aliases.filter((a) => a.kind === "PROJECT" && a.projectId === p.id).map((a) => a.normalized),
  }));
  return { people: personCanon, projects: projectCanon, openCards };
}

export class BoardMoveError extends Error {}

/**
 * Moves a card to `status`. `beforeId` is the card that will sit immediately
 * ABOVE it in the target column, `afterId` the one immediately BELOW. With
 * neither (or an unknown id) the card goes to the end of the column.
 * Returns null when the card does not exist.
 */
export async function moveCard(
  id: string,
  status: BoardStatus,
  beforeId: string | undefined,
  afterId: string | undefined,
  actor: { id: string }
) {
  return db.$transaction(async (tx) => {
    const card = await tx.boardCard.findUnique({ where: { id } });
    if (!card) return null;

    const column = await tx.boardCard.findMany({
      where: { status, archivedAt: null, id: { not: id } },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    let idx = column.length;
    if (beforeId) {
      const i = column.findIndex((c) => c.id === beforeId);
      if (i >= 0) idx = i + 1;
    } else if (afterId) {
      const i = column.findIndex((c) => c.id === afterId);
      if (i >= 0) idx = i;
    }

    let lo = column[idx - 1]?.position;
    let hi = column[idx]?.position;
    if (lo !== undefined && hi !== undefined && needsRenormalize(lo, hi)) {
      for (let i = 0; i < column.length; i++) {
        column[i].position = (i + 1) * POSITION_STEP;
        await tx.boardCard.update({
          where: { id: column[i].id },
          data: { position: column[i].position },
        });
      }
      lo = column[idx - 1]?.position;
      hi = column[idx]?.position;
    }
    const position = positionBetween(lo, hi);

    const now = new Date();
    const data: Record<string, unknown> = {
      status,
      position,
      humanEditedAt: now,
      updatedById: actor.id,
    };
    if (status === "DONE" && card.status !== "DONE") data.completedAt = now;
    if (status !== "DONE" && card.status === "DONE") data.completedAt = null;

    return tx.boardCard.update({ where: { id }, data });
  });
}

/** Position at the end of a column (for creates). */
export async function endPosition(status: BoardStatus): Promise<number> {
  const last = await db.boardCard.findFirst({
    where: { status, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return positionBetween(last?.position, undefined);
}
