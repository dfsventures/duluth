export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { updateBoardCard } from "@/lib/board-actions";

// Hand-written allowlist (F95 lesson) lives in updateBoardCard: never spread the body into Prisma.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    // Part 39 (WS119): shared with the Marge tools.
    const r = await updateBoardCard(user!, id, body as Record<string, unknown>);
    return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    console.error("PATCH /api/admin/board/cards/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
