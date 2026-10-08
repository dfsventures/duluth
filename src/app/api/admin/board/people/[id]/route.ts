export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { MAX_NAME_LENGTH } from "@/lib/board";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || typeof b !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const person = await db.boardPerson.findUnique({ where: { id } });
    if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if ("displayName" in b) {
      if (person.userId) {
        return NextResponse.json(
          { error: "A linked admin's name comes from their account and can't be edited here" },
          { status: 400 }
        );
      }
      const name = typeof b.displayName === "string" ? b.displayName.trim() : "";
      if (!name || name.length > MAX_NAME_LENGTH) {
        return NextResponse.json({ error: "A name of 1-120 characters is required" }, { status: 400 });
      }
      data.displayName = name;
    }
    if ("archived" in b) {
      if (typeof b.archived !== "boolean") {
        return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
      }
      data.archivedAt = b.archived ? new Date() : null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await db.boardPerson.update({ where: { id }, data });
    await logAdminAction(user!, "BOARD_PERSON_UPDATED", {
      targetType: "BoardPerson",
      targetId: id,
      metadata: { fields: Object.keys(data) },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/admin/board/people/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
