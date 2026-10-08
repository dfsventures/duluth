export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { endPosition } from "@/lib/board-server";
import {
  isBoardStatus,
  parseDueDate,
  MAX_TITLE_LENGTH,
  MAX_NOTES_LENGTH,
} from "@/lib/board";

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { title, status, ownerId, projectId, dueDate, notes } = body as Record<string, unknown>;

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
    if (ownerId) {
      if (typeof ownerId !== "string" || !(await db.boardPerson.findUnique({ where: { id: ownerId }, select: { id: true } }))) {
        return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
      }
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
        ownerId: ownerId ? (ownerId as string) : null,
        projectId: projectId ? (projectId as string) : null,
        source: "MANUAL",
        humanEditedAt: now,
        completedAt: col === "DONE" ? now : null,
        createdById: user!.id,
        updatedById: user!.id,
      },
    });

    await logAdminAction(user!, "BOARD_CARD_CREATED", {
      targetType: "BoardCard",
      targetId: card.id,
      metadata: { title: card.title, status: card.status },
    });
    return NextResponse.json(card, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/board/cards error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
