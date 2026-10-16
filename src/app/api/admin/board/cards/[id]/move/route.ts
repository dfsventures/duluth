export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { moveBoardCard } from "@/lib/board-actions";

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
    // Part 39 (WS119): shared with the Marge tools.
    const r = await moveBoardCard(user!, id, b);
    return r.ok ? NextResponse.json(r.value) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    console.error("POST /api/admin/board/cards/[id]/move error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
