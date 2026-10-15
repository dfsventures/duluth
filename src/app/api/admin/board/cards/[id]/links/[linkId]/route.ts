export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { hostOf } from "@/lib/board-links";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const { id, linkId } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const link = await db.boardCardLink.findUnique({ where: { id: linkId } });
    if (!link || link.cardId !== id) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    await db.boardCardLink.delete({ where: { id: linkId } });
    await logAdminAction(user!, "BOARD_CARD_LINK_REMOVED", {
      targetType: "BoardCard",
      targetId: id,
      metadata: { cardId: id, host: hostOf(link.url) },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/board/cards/[id]/links/[linkId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
