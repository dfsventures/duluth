export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { buildDigestActionItems, endPosition } from "@/lib/board-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const digest = await db.weeklyDigest.findUnique({
      where: { id },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!digest) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(digest);
  } catch (err) {
    console.error("GET /api/admin/digest/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.weeklyDigest.findUnique({ where: { id }, select: { sentAt: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Editable if draft or sent within 12 hours
    if (existing.sentAt) {
      const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
      if (Date.now() - existing.sentAt.getTime() > TWELVE_HOURS_MS) {
        return NextResponse.json({ error: "Digest can only be edited within 12 hours of sending" }, { status: 403 });
      }
    }

    const body = await request.json() as {
      title?: string;
      weekOf?: string;
      sections?: { id: string; heading: string; content: string }[];
      todos?: { id?: string; text: string }[];
    };

    // Part 37 (WS108.5): on a draft, a todo added in edit mode is a MANUAL board
    // card (the digest row is then built from it). On a sent digest the rows are
    // frozen, so it stays a plain digest-only todo as before.
    const isDraft = !existing.sentAt;
    const newBoardTodos: string[] = [];

    const digest = await db.$transaction(async (tx) => {
      const updated = await tx.weeklyDigest.update({
        where: { id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.weekOf !== undefined && { weekOf: new Date(body.weekOf) }),
          ...(body.sections !== undefined && { sections: body.sections }),
        },
      });

      if (Array.isArray(body.todos)) {
        // Part 37, WS104.4 (F104): diff instead of delete-all, so done ticks,
        // assignees and ids survive an edit.
        const existingTodos = await tx.digestTodo.findMany({ where: { digestId: id }, select: { id: true } });
        const keep = new Set(body.todos.filter((t) => t.id).map((t) => t.id!));
        const removed = existingTodos.filter((e) => !keep.has(e.id)).map((e) => e.id);
        if (removed.length) await tx.digestTodo.deleteMany({ where: { digestId: id, id: { in: removed } } });
        for (const t of body.todos) {
          if (t.id) {
            // updateMany scopes to this digest: an id from another digest is a no-op, not a cross-digest write.
            // cardId: null — rows linked to a board card are read-only here (edit on the board).
            await tx.digestTodo.updateMany({ where: { id: t.id, digestId: id, cardId: null }, data: { text: t.text } });
          } else if (isDraft) {
            if (t.text?.trim()) newBoardTodos.push(t.text.trim().slice(0, 300));
          } else {
            await tx.digestTodo.create({
              data: { id: crypto.randomUUID().replace(/-/g, "").slice(0, 25), digestId: id, text: t.text },
            });
          }
        }
      }

      return updated;
    });

    if (newBoardTodos.length > 0) {
      for (const text of newBoardTodos) {
        const card = await db.boardCard.create({
          data: {
            title: text,
            status: "TODO",
            position: await endPosition("TODO"),
            source: "MANUAL",
            humanEditedAt: new Date(),
            createdById: user!.id,
            updatedById: user!.id,
          },
        });
        await logAdminAction(user!, "BOARD_CARD_CREATED", {
          targetType: "BoardCard",
          targetId: card.id,
          metadata: { title: card.title, status: card.status, via: "digest" },
        });
      }
      await buildDigestActionItems(id);
    }

    const full = await db.weeklyDigest.findUnique({
      where: { id },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await logAdminAction(user!, "DIGEST_UPDATED", { targetType: "WeeklyDigest", targetId: id });
    return NextResponse.json(full);
  } catch (err) {
    console.error("PATCH /api/admin/digest/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.weeklyDigest.findUnique({ where: { id }, select: { sentAt: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (existing.sentAt) {
      return NextResponse.json({ error: "Sent digests cannot be deleted" }, { status: 403 });
    }

    await db.weeklyDigest.delete({ where: { id } });
    await logAdminAction(user!, "DIGEST_DELETED", { targetType: "WeeklyDigest", targetId: id });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/admin/digest/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
