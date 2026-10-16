// Part 39 (WS119) — board card writes shared by /api/admin/board/** and the Marge tools.
// Messages and status codes are the routes' own, verbatim; the routes are now thin wrappers.
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import { endPosition, setCardOwnersIn, moveCard, CARD_OWNER_INCLUDE, toCardData } from "@/lib/board-server";
import { legacyOwnerFields, computeNeedsReview } from "@/lib/board-reconcile";
import {
  isBoardStatus,
  parseDueDate,
  MAX_TITLE_LENGTH,
  MAX_NOTES_LENGTH,
  parseOwnerInput,
} from "@/lib/board";
import { MAX_LINKS_PER_CARD, hostOf, parseLinkInput } from "@/lib/board-links";

export interface Actor {
  id: string;
  email?: string | null;
}
/** Present only for writes that arrive through Marge; absent for the web UI. */
export interface Via {
  via: "marge";
  margeActionId: string;
}
export type ActionResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; error: string };

const viaMeta = (v?: Via) => (v ? { via: v.via, margeActionId: v.margeActionId } : {});
const fail = (status: 400 | 404 | 409, error: string): { ok: false; status: 400 | 404 | 409; error: string } => ({
  ok: false,
  status,
  error,
});

export async function createBoardCard(
  actor: Actor,
  body: Record<string, unknown>,
  via?: Via
): Promise<ActionResult<ReturnType<typeof toCardData>>> {
  const { title, status, projectId, dueDate, notes } = body;

  if (typeof title !== "string" || !title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
    return fail(400, "A title of 1-300 characters is required");
  }
  if (status !== undefined && !isBoardStatus(status)) {
    return fail(400, "Invalid status");
  }
  if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH)) {
    return fail(400, "Invalid notes");
  }
  let due: Date | null = null;
  if (dueDate !== undefined) {
    const parsed = parseDueDate(dueDate);
    if (parsed === undefined) return fail(400, "dueDate must be YYYY-MM-DD");
    due = parsed;
  }
  // Part 38: `ownerIds` (array) or the legacy `ownerId` (JC-MO-M).
  const ownerInput = parseOwnerInput(body);
  if (!ownerInput.ok) return fail(400, ownerInput.error);
  const ownerIds = ownerInput.ownerIds ?? [];
  if (ownerIds.length && (await db.boardPerson.count({ where: { id: { in: ownerIds } } })) !== ownerIds.length) {
    return fail(400, "Unknown owner");
  }
  if (projectId) {
    if (typeof projectId !== "string" || !(await db.boardProject.findUnique({ where: { id: projectId }, select: { id: true } }))) {
      return fail(400, "Unknown project");
    }
  }

  const col = isBoardStatus(status) ? status : "TODO";
  const now = new Date();
  const card = await db.boardCard.create({
    data: {
      title: title.trim(),
      notes: typeof notes === "string" && notes.trim() ? notes : null,
      status: col,
      position: await endPosition(col),
      dueDate: due,
      ...legacyOwnerFields(ownerIds, {}, []), // LEGACY (Part 38): dual-written, first owner
      owners: ownerIds.length ? { create: ownerIds.map((personId) => ({ personId })) } : undefined,
      projectId: projectId ? (projectId as string) : null,
      source: "MANUAL",
      humanEditedAt: now,
      completedAt: col === "DONE" ? now : null,
      createdById: actor.id,
      updatedById: actor.id,
    },
    include: CARD_OWNER_INCLUDE,
  });

  await logAdminAction(actor, "BOARD_CARD_CREATED", {
    targetType: "BoardCard",
    targetId: card.id,
    metadata: { title: card.title, status: card.status, ...viaMeta(via) },
  });
  return { ok: true, value: toCardData(card) };
}

// Hand-written allowlist (F95 lesson): never spread the body into Prisma.
export async function updateBoardCard(
  actor: Actor,
  id: string,
  b: Record<string, unknown>,
  via?: Via
): Promise<ActionResult<ReturnType<typeof toCardData>>> {
  const card = await db.boardCard.findUnique({
    where: { id },
    include: { owners: { select: { personId: true, rawName: true } } },
  });
  if (!card) return fail(404, "Card not found");

  const data: Record<string, unknown> = {};

  if ("title" in b) {
    if (typeof b.title !== "string" || !b.title.trim() || b.title.trim().length > MAX_TITLE_LENGTH) {
      return fail(400, "A title of 1-300 characters is required");
    }
    data.title = b.title.trim();
  }
  if ("notes" in b) {
    if (b.notes !== null && (typeof b.notes !== "string" || b.notes.length > MAX_NOTES_LENGTH)) {
      return fail(400, "Invalid notes");
    }
    data.notes = typeof b.notes === "string" && b.notes.trim() ? b.notes : null;
  }
  if ("dueDate" in b) {
    const parsed = parseDueDate(b.dueDate);
    if (parsed === undefined) return fail(400, "dueDate must be YYYY-MM-DD");
    data.dueDate = parsed;
  }

  // Part 38: `ownerIds` (array) or the legacy `ownerId` (JC-MO-M). An explicit
  // owner set is the admin's word, so it also clears the unmatched names.
  const ownerInput = parseOwnerInput(b);
  if (!ownerInput.ok) return fail(400, ownerInput.error);
  const newOwnerIds = ownerInput.ownerIds;
  if (
    newOwnerIds &&
    newOwnerIds.length &&
    (await db.boardPerson.count({ where: { id: { in: newOwnerIds } } })) !== newOwnerIds.length
  ) {
    return fail(400, "Unknown owner");
  }

  let rawProject = card.rawProjectName;
  let projectIdAfter = card.projectId;
  if ("projectId" in b) {
    if (b.projectId !== null) {
      if (typeof b.projectId !== "string" || !(await db.boardProject.findUnique({ where: { id: b.projectId }, select: { id: true } }))) {
        return fail(400, "Unknown project");
      }
    }
    data.projectId = b.projectId;
    data.rawProjectName = null;
    rawProject = null;
    projectIdAfter = b.projectId as string | null;
  }
  // F117: one rule for the review flag, recomputed whenever owners or project change.
  if (newOwnerIds !== undefined || "projectId" in b) {
    data.needsReview = computeNeedsReview({
      unmatchedOwnerNames: newOwnerIds !== undefined ? [] : card.unmatchedOwnerNames,
      rawProjectName: rawProject,
      projectId: projectIdAfter,
    });
  }

  let archiving = false;
  if ("archived" in b) {
    if (typeof b.archived !== "boolean") return fail(400, "archived must be a boolean");
    data.archivedAt = b.archived ? new Date() : null;
    archiving = b.archived;
  }

  if (Object.keys(data).length === 0 && newOwnerIds === undefined) {
    return fail(400, "No valid fields to update");
  }

  data.humanEditedAt = new Date();
  data.updatedById = actor.id;

  const previousOwnerIds = card.owners.map((o) => o.personId);
  const updated = await db.$transaction(async (tx) => {
    await tx.boardCard.update({ where: { id }, data });
    if (newOwnerIds !== undefined) {
      // Owners who stay keep the text they were heard as (Q100-a/c).
      const keep: Record<string, string | null> = {};
      for (const o of card.owners) if (newOwnerIds.includes(o.personId)) keep[o.personId] = o.rawName;
      await setCardOwnersIn(tx, id, newOwnerIds, keep, []);
    }
    return tx.boardCard.findUniqueOrThrow({ where: { id }, include: CARD_OWNER_INCLUDE });
  });
  const fields = Object.keys(data).filter((k) => k !== "humanEditedAt" && k !== "updatedById");
  const metadata: Record<string, unknown> = { fields };
  if (newOwnerIds !== undefined) {
    fields.push("owners");
    metadata.ownersAdded = newOwnerIds.filter((x) => !previousOwnerIds.includes(x));
    metadata.ownersRemoved = previousOwnerIds.filter((x) => !newOwnerIds.includes(x));
  }
  await logAdminAction(actor, archiving ? "BOARD_CARD_ARCHIVED" : "BOARD_CARD_UPDATED", {
    targetType: "BoardCard",
    targetId: id,
    metadata: { ...metadata, ...viaMeta(via) },
  });
  return { ok: true, value: toCardData(updated) };
}

export async function moveBoardCard(
  actor: Actor,
  id: string,
  b: Record<string, unknown>,
  via?: Via
): Promise<ActionResult<NonNullable<Awaited<ReturnType<typeof moveCard>>>>> {
  if (!isBoardStatus(b.status)) return fail(400, "Invalid status");
  for (const k of ["beforeId", "afterId"] as const) {
    if (b[k] !== undefined && b[k] !== null && typeof b[k] !== "string") {
      return fail(400, `Invalid ${k}`);
    }
  }

  const card = await moveCard(
    id,
    b.status,
    (b.beforeId as string | null | undefined) ?? undefined,
    (b.afterId as string | null | undefined) ?? undefined,
    actor
  );
  if (!card) return fail(404, "Card not found");

  await logAdminAction(actor, "BOARD_CARD_MOVED", {
    targetType: "BoardCard",
    targetId: id,
    metadata: { status: b.status, ...viaMeta(via) },
  });
  return { ok: true, value: card };
}

export async function addBoardCardLink(
  actor: Actor,
  id: string,
  body: unknown,
  via?: Via
): Promise<ActionResult<Awaited<ReturnType<typeof db.boardCardLink.create>>>> {
  const input = parseLinkInput(body);
  if (!input.ok) return fail(400, input.error);

  const card = await db.boardCard.findUnique({ where: { id }, select: { id: true } });
  if (!card) return fail(404, "Card not found");

  const count = await db.boardCardLink.count({ where: { cardId: id } });
  if (count >= MAX_LINKS_PER_CARD) {
    return fail(400, `A card can have at most ${MAX_LINKS_PER_CARD} links`);
  }

  const link = await db.boardCardLink.create({
    data: { cardId: id, url: input.url, label: input.label, addedById: actor.id },
  });
  await logAdminAction(actor, "BOARD_CARD_LINK_ADDED", {
    targetType: "BoardCard",
    targetId: id,
    metadata: { cardId: id, host: hostOf(input.url), ...viaMeta(via) },
  });
  return { ok: true, value: link };
}
