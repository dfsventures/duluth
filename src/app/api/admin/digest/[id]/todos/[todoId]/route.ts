export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  try {
    const { todoId } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { completed } = body as { completed: boolean };

    const todo = await db.digestTodo.update({
      where: { id: todoId },
      data: { completed },
    });

    return NextResponse.json(todo);
  } catch (err) {
    console.error("PATCH /api/admin/digest/[id]/todos/[todoId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
