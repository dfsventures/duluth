export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { endPosition, CARD_OWNER_INCLUDE, toCardData } from "@/lib/board-server";
import { legacyOwnerFields } from "@/lib/board-reconcile";
import {
  isBoardStatus,
  parseDueDate,
  MAX_TITLE_LENGTH,
  MAX_NOTES_LENGTH,
  parseOwnerInput,
} from "@/lib/board";

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { title, status, projectId, dueDate, notes } = body as Record<string, unknown>;

    if (typeof title !== "string" || !title.trim() || title.trim().length > MAX_TITLE_LENGTH) {
      return NextResponse.json({ error: "A title of 1-300 characters is required" }, { status: 400 });
    }
    if (status !== undefined && !isBoardStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > MAX_NOTES_LENGTH)) {
      return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
    }
    let due: Date | null = null;
    if (dueDate !== undefined) {
      const parsed = parseDueDate(dueDate);
      if (parsed === undefined) {
        return NextResponse.json({ error: "dueDate must be YYYY-MM-DD" }, { status: 400 });
      }
      due = parsed;
    }
    // Part 38: `ownerIds` (array) or the legacy `ownerId` (JC-MO-M).
    const ownerInput = parseOwnerInput(body as Record<string, unknown>);
    if (!ownerInput.ok) {
      return NextResponse.json({ error: ownerInput.error }, { status: 400 });
    }
    const ownerIds = ownerInput.ownerIds ?? [];
    if (ownerIds.length && (await db.boardPerson.count({ where: { id: { in: ownerIds } } })) !== ownerIds.length) {
      return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
    }
    if (projectId) {
      if (typeof projectId !== "string" || !(await db.boardProject.findUnique({ where: { id: projectId }, select: { id: true } }))) {
        return NextResponse.json({ error: "Unknown project" }, { status: 400 });
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
        createdById: user!.id,
        updatedById: user!.id,
      },
      include: CARD_OWNER_INCLUDE,
    });

    await logAdminAction(user!, "BOARD_CARD_CREATED", {
      targetType: "BoardCard",
      targetId: card.id,
      metadata: { title: card.title, status: card.status },
    });
    return NextResponse.json(toCardData(card), { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/board/cards error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
