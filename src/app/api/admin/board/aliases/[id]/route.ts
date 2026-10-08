export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Undo a bad alias.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const alias = await db.boardAlias.findUnique({ where: { id } });
    if (!alias) return NextResponse.json({ error: "Alias not found" }, { status: 404 });

    await db.boardAlias.delete({ where: { id } });
    await logAdminAction(user!, "BOARD_ALIAS_DELETED", {
      targetType: "BoardAlias",
      targetId: id,
      metadata: { kind: alias.kind },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/admin/board/aliases/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
