export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { MAX_LINKS_PER_CARD, hostOf, parseLinkInput } from "@/lib/board-links";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    const input = parseLinkInput(body);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

    const card = await db.boardCard.findUnique({ where: { id }, select: { id: true } });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    const count = await db.boardCardLink.count({ where: { cardId: id } });
    if (count >= MAX_LINKS_PER_CARD) {
      return NextResponse.json(
        { error: `A card can have at most ${MAX_LINKS_PER_CARD} links` },
        { status: 400 }
      );
    }

    const link = await db.boardCardLink.create({
      data: { cardId: id, url: input.url, label: input.label, addedById: user!.id },
    });
    await logAdminAction(user!, "BOARD_CARD_LINK_ADDED", {
      targetType: "BoardCard",
      targetId: id,
      metadata: { cardId: id, host: hostOf(input.url) },
    });
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/board/cards/[id]/links error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
