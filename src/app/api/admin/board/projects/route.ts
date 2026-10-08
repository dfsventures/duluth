export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { normalizeName } from "@/lib/board-reconcile";
import { MAX_NAME_LENGTH } from "@/lib/board";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const projects = await db.boardProject.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(projects);
  } catch (err) {
    console.error("GET /api/admin/board/projects error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: "A name of 1-120 characters is required" }, { status: 400 });
    }
    const all = await db.boardProject.findMany({ select: { name: true } });
    if (all.some((p) => normalizeName(p.name) === normalizeName(name))) {
      return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 });
    }
    const project = await db.boardProject.create({ data: { name } });
    await logAdminAction(user!, "BOARD_PROJECT_CREATED", {
      targetType: "BoardProject",
      targetId: project.id,
      metadata: { name },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 });
    }
    console.error("POST /api/admin/board/projects error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
