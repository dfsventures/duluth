export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { moveCard } from "@/lib/board-server";
import { isBoardStatus } from "@/lib/board";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const b = (body ?? {}) as Record<string, unknown>;
    if (!isBoardStatus(b.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    for (const k of ["beforeId", "afterId"] as const) {
      if (b[k] !== undefined && b[k] !== null && typeof b[k] !== "string") {
        return NextResponse.json({ error: `Invalid ${k}` }, { status: 400 });
      }
    }

    const card = await moveCard(
      id,
      b.status,
      (b.beforeId as string | null | undefined) ?? undefined,
      (b.afterId as string | null | undefined) ?? undefined,
      user!
    );
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    await logAdminAction(user!, "BOARD_CARD_MOVED", {
      targetType: "BoardCard",
      targetId: id,
      metadata: { status: b.status },
    });
    return NextResponse.json(card);
  } catch (err) {
    console.error("POST /api/admin/board/cards/[id]/move error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
