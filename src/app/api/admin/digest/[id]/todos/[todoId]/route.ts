export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { moveCardIn } from "@/lib/board-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  try {
    const { id, todoId } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { completed } = body as { completed: boolean };

    // Part 37, WS104.5 (F107): scope to the digest in the path.
    // WS108.6: when the row is linked to a board card, the tick moves the card
    // (DONE / back to TODO) in the same transaction.
    const todo = await db.$transaction(async (tx) => {
      const { count } = await tx.digestTodo.updateMany({
        where: { id: todoId, digestId: id },
        data: { completed },
      });
      if (count === 0) return null;
      const row = await tx.digestTodo.findUnique({ where: { id: todoId } });
      if (row?.cardId) {
        const card = await tx.boardCard.findUnique({ where: { id: row.cardId }, select: { status: true, archivedAt: true } });
        if (card && !card.archivedAt) {
          if (completed && card.status !== "DONE") {
            await moveCardIn(tx, row.cardId, "DONE", undefined, undefined, user!);
          } else if (!completed && card.status === "DONE") {
            await moveCardIn(tx, row.cardId, "TODO", undefined, undefined, user!);
          }
        }
      }
      return row;
    });
    if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await logAdminAction(user!, "DIGEST_TODO_TOGGLED", { targetType: "DigestTodo", targetId: todoId, metadata: { completed } });
    return NextResponse.json(todo);
  } catch (err) {
    console.error("PATCH /api/admin/digest/[id]/todos/[todoId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
