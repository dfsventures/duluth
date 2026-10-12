export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { setCardOwnersIn, CARD_OWNER_INCLUDE, toCardData } from "@/lib/board-server";
import { computeNeedsReview } from "@/lib/board-reconcile";
import { parseDueDate, parseOwnerInput, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH } from "@/lib/board";

// Hand-written allowlist (F95 lesson): never spread the body into Prisma.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const card = await db.boardCard.findUnique({
      where: { id },
      include: { owners: { select: { personId: true, rawName: true } } },
    });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    const data: Record<string, unknown> = {};

    if ("title" in b) {
      if (typeof b.title !== "string" || !b.title.trim() || b.title.trim().length > MAX_TITLE_LENGTH) {
        return NextResponse.json({ error: "A title of 1-300 characters is required" }, { status: 400 });
      }
      data.title = b.title.trim();
    }
    if ("notes" in b) {
      if (b.notes !== null && (typeof b.notes !== "string" || b.notes.length > MAX_NOTES_LENGTH)) {
        return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
      }
      data.notes = typeof b.notes === "string" && b.notes.trim() ? b.notes : null;
    }
    if ("dueDate" in b) {
      const parsed = parseDueDate(b.dueDate);
      if (parsed === undefined) {
        return NextResponse.json({ error: "dueDate must be YYYY-MM-DD" }, { status: 400 });
      }
      data.dueDate = parsed;
    }

    // Part 38: `ownerIds` (array) or the legacy `ownerId` (JC-MO-M). An explicit
    // owner set is the admin's word, so it also clears the unmatched names.
    const ownerInput = parseOwnerInput(b);
    if (!ownerInput.ok) {
      return NextResponse.json({ error: ownerInput.error }, { status: 400 });
    }
    const newOwnerIds = ownerInput.ownerIds;
    if (
      newOwnerIds &&
      newOwnerIds.length &&
      (await db.boardPerson.count({ where: { id: { in: newOwnerIds } } })) !== newOwnerIds.length
    ) {
      return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
    }

    let rawProject = card.rawProjectName;
    let projectIdAfter = card.projectId;
    if ("projectId" in b) {
      if (b.projectId !== null) {
        if (typeof b.projectId !== "string" || !(await db.boardProject.findUnique({ where: { id: b.projectId }, select: { id: true } }))) {
          return NextResponse.json({ error: "Unknown project" }, { status: 400 });
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
      if (typeof b.archived !== "boolean") {
        return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
      }
      data.archivedAt = b.archived ? new Date() : null;
      archiving = b.archived;
    }

    if (Object.keys(data).length === 0 && newOwnerIds === undefined) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    data.humanEditedAt = new Date();
    data.updatedById = user!.id;

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
    await logAdminAction(user!, archiving ? "BOARD_CARD_ARCHIVED" : "BOARD_CARD_UPDATED", {
      targetType: "BoardCard",
      targetId: id,
      metadata,
    });
    return NextResponse.json(toCardData(updated));
  } catch (err) {
    console.error("PATCH /api/admin/board/cards/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
