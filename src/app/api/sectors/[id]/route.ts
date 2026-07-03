export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const existing = await db.sector.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, NOT: { id } },
    });
    if (existing) {
      return NextResponse.json({ error: "A sector with that name already exists" }, { status: 409 });
    }

    const sector = await db.sector.update({ where: { id }, data: { name } });
    await logAdminAction(user!, "SECTOR_RENAMED", { targetType: "Sector", targetId: id, metadata: { name } });
    return NextResponse.json(sector);
  } catch (err) {
    console.error("PATCH /api/sectors/[id] error:", err);
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

    await db.sector.delete({ where: { id } });
    await logAdminAction(user!, "SECTOR_DELETED", { targetType: "Sector", targetId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/sectors/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
