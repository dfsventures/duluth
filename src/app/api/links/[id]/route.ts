export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAuth();
    if (error) return error;

    const link = await db.shareableLink.findUnique({ where: { id } });
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Founders can only delete their own links
    if (user!.role !== "ADMIN" && link.createdById !== user!.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.shareableLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/links/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAuth();
    if (error) return error;

    const link = await db.shareableLink.findUnique({
      where: { id },
      include: {
        views: { orderBy: { viewedAt: "desc" } },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (user!.role !== "ADMIN" && link.createdById !== user!.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(link);
  } catch (err) {
    console.error("GET /api/links/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
