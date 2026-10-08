export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { parseDueDate, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH } from "@/lib/board";

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

    const card = await db.boardCard.findUnique({ where: { id } });
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

    let rawOwner = card.rawOwnerName;
    let rawProject = card.rawProjectName;
    if ("ownerId" in b) {
      if (b.ownerId !== null) {
        if (typeof b.ownerId !== "string" || !(await db.boardPerson.findUnique({ where: { id: b.ownerId }, select: { id: true } }))) {
          return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
        }
      }
      data.ownerId = b.ownerId;
      data.rawOwnerName = null;
      rawOwner = null;
    }
    if ("projectId" in b) {
      if (b.projectId !== null) {
        if (typeof b.projectId !== "string" || !(await db.boardProject.findUnique({ where: { id: b.projectId }, select: { id: true } }))) {
          return NextResponse.json({ error: "Unknown project" }, { status: 400 });
        }
      }
      data.projectId = b.projectId;
      data.rawProjectName = null;
      rawProject = null;
    }
    if (("ownerId" in b || "projectId" in b) && card.needsReview && !rawOwner && !rawProject) {
      data.needsReview = false;
    }

    let archiving = false;
    if ("archived" in b) {
      if (typeof b.archived !== "boolean") {
        return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
      }
      data.archivedAt = b.archived ? new Date() : null;
      archiving = b.archived;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    data.humanEditedAt = new Date();
    data.updatedById = user!.id;

    const updated = await db.boardCard.update({ where: { id }, data });
    await logAdminAction(user!, archiving ? "BOARD_CARD_ARCHIVED" : "BOARD_CARD_UPDATED", {
      targetType: "BoardCard",
      targetId: id,
      metadata: { fields: Object.keys(data).filter((k) => k !== "humanEditedAt" && k !== "updatedById") },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/admin/board/cards/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
