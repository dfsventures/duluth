export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { normalizeName } from "@/lib/board-reconcile";
import { MAX_NAME_LENGTH } from "@/lib/board";

// Rename / archive. Aliases point at the id, so a rename never breaks them.
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
    const project = await db.boardProject.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if ("name" in b) {
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!name || name.length > MAX_NAME_LENGTH) {
        return NextResponse.json({ error: "A name of 1-120 characters is required" }, { status: 400 });
      }
      const all = await db.boardProject.findMany({ where: { id: { not: id } }, select: { name: true } });
      if (all.some((p) => normalizeName(p.name) === normalizeName(name))) {
        return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 });
      }
      data.name = name;
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

    const updated = await db.boardProject.update({ where: { id }, data });
    await logAdminAction(user!, "BOARD_PROJECT_UPDATED", {
      targetType: "BoardProject",
      targetId: id,
      metadata: { fields: Object.keys(data), archived: archiving || undefined },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 });
    }
    console.error("PATCH /api/admin/board/projects/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
