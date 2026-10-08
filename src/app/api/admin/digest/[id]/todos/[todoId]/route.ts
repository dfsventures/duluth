export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

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
    const { count } = await db.digestTodo.updateMany({
      where: { id: todoId, digestId: id },
      data: { completed },
    });
    if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const todo = await db.digestTodo.findUnique({ where: { id: todoId } });

    await logAdminAction(user!, "DIGEST_TODO_TOGGLED", { targetType: "DigestTodo", targetId: todoId, metadata: { completed } });
    return NextResponse.json(todo);
  } catch (err) {
    console.error("PATCH /api/admin/digest/[id]/todos/[todoId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
