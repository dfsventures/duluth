// Part 37 (WS106.3) — db-touching board helpers. Server only.
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import crypto from "crypto";
import { positionBetween, needsRenormalize, POSITION_STEP, type BoardStatus } from "@/lib/board";
import { normalizeName, legacyOwnerFields, type Canonical } from "@/lib/board-reconcile";

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
        owners: { select: { personId: true } },
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
  return {
    people: personCanon,
    projects: projectCanon,
    // ownerId kept (legacy) until WS115 changes the prompt line; ownerIds is the Part 38 set.
    openCards: openCards.map(({ owners, ...c }) => ({ ...c, ownerIds: owners.map((o) => o.personId) })),
  };
}

export const CARD_OWNER_INCLUDE = {
  owners: { select: { personId: true } },
  // Proof links ride along with every card the board client receives.
  links: { orderBy: { createdAt: "asc" } },
} as const;

/**
 * Part 38: every route that returns a card to the board client goes through
 * this. Never emits `ownerIds: undefined` (it would wipe the key in the
 * client's merge); the move route simply does not use it.
 */
export function toCardData<T extends { owners: { personId: string }[] }>(c: T) {
  const { owners, ...rest } = c;
  return { ...rest, ownerIds: owners.map((o) => o.personId) };
}

/** Replace a card's owner set (Part 38). Runs inside the caller's transaction. */
export async function setCardOwnersIn(
  tx: Prisma.TransactionClient,
  cardId: string,
  ownerIds: string[],
  raw: Record<string, string | null> = {},
  unmatchedOwnerNames?: string[] // undefined = leave as is
) {
  await tx.boardCardOwner.deleteMany({ where: { cardId, personId: { notIn: ownerIds } } });
  if (ownerIds.length) {
    await tx.boardCardOwner.createMany({
      data: ownerIds.map((personId) => ({ cardId, personId, rawName: raw[personId] ?? null })),
      skipDuplicates: true,
    });
  }
  const unmatched =
    unmatchedOwnerNames ??
    (await tx.boardCard.findUniqueOrThrow({ where: { id: cardId }, select: { unmatchedOwnerNames: true } }))
      .unmatchedOwnerNames;
  await tx.boardCard.update({
    where: { id: cardId },
    data: {
      ...legacyOwnerFields(ownerIds, raw, unmatched),
      ...(unmatchedOwnerNames ? { unmatchedOwnerNames } : {}),
    },
  });
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
  return db.$transaction((tx) => moveCardIn(tx, id, status, beforeId, afterId, actor));
}

/** moveCard's body, runnable inside a caller-owned transaction (WS108.6). */
export async function moveCardIn(
  tx: Prisma.TransactionClient,
  id: string,
  status: BoardStatus,
  beforeId: string | undefined,
  afterId: string | undefined,
  actor: { id: string }
) {
  {
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
  }
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

/** Stable idempotency-key suffix for a card title (WS108.4 / WS109). */
export function titleKey(title: string): string {
  return crypto.createHash("sha1").update(normalizeName(title)).digest("hex").slice(0, 12);
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Part 37 (WS108): builds/refreshes the digest's linked action-item rows from
 * the board. Members: every open card, plus cards completed after the last
 * SENT digest (marked completed). Never deletes rows; only creates missing
 * linked rows and refreshes text/labels/completed/assignee. No-op once the
 * digest has been sent (freeze).
 */
export async function buildDigestActionItems(
  digestId: string,
  client: typeof db | Prisma.TransactionClient = db
): Promise<{ created: number; updated: number }> {
  const digest = await client.weeklyDigest.findUnique({
    where: { id: digestId },
    select: { id: true, sentAt: true },
  });
  if (!digest || digest.sentAt) return { created: 0, updated: 0 };

  const lastSent = await client.weeklyDigest.findFirst({
    where: { sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });

  const or: Prisma.BoardCardWhereInput[] = [{ status: { not: "DONE" } }];
  if (lastSent?.sentAt) or.push({ status: "DONE", completedAt: { gt: lastSent.sentAt } });
  const cards = await client.boardCard.findMany({
    where: { archivedAt: null, OR: or },
    orderBy: [{ status: "asc" }, { position: "asc" }],
    include: {
      owners: { include: { person: { include: { user: { select: { name: true, email: true } } } } } },
      project: { select: { name: true } },
    },
  });

  const rows = await client.digestTodo.findMany({
    where: { digestId, cardId: { not: null } },
    select: {
      id: true,
      cardId: true,
      text: true,
      ownerLabel: true,
      ownerLabels: true,
      projectLabel: true,
      completed: true,
      assigneeId: true,
    },
  });
  const rowByCard = new Map(rows.map((r) => [r.cardId as string, r]));

  let created = 0;
  let updated = 0;
  for (const c of cards) {
    // Part 38: one row per card, never per owner. Labels sort alphabetically so
    // no owner reads as the lead (JC-MO-A); assignee = first owner with a login (JC-MO-E).
    const byLabel = c.owners
      .map(({ person: p }) => ({ label: p.user?.name ?? p.user?.email ?? p.displayName, userId: p.userId }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const ownerLabels = byLabel.map((o) => o.label);
    const ownerLabel = ownerLabels.join(", ") || null;
    const projectLabel = c.project?.name ?? null;
    const assigneeId = byLabel.find((o) => o.userId)?.userId ?? null;
    const completed = c.status === "DONE";
    const row = rowByCard.get(c.id);
    if (!row) {
      await client.digestTodo.create({
        data: {
          id: crypto.randomUUID().replace(/-/g, "").slice(0, 25),
          digestId,
          cardId: c.id,
          text: c.title,
          ownerLabel,
          ownerLabels,
          projectLabel,
          completed,
          assigneeId,
        },
      });
      created++;
    } else if (
      row.text !== c.title ||
      row.ownerLabel !== ownerLabel ||
      !sameStrings(row.ownerLabels, ownerLabels) ||
      row.projectLabel !== projectLabel ||
      row.completed !== completed ||
      row.assigneeId !== assigneeId
    ) {
      await client.digestTodo.update({
        where: { id: row.id },
        data: { text: c.title, ownerLabel, ownerLabels, projectLabel, completed, assigneeId },
      });
      updated++;
    }
  }
  return { created, updated };
}
