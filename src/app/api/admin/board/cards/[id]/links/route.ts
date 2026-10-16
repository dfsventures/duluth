export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { addBoardCardLink } from "@/lib/board-actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    // Part 39 (WS119): shared with the Marge tools.
    const r = await addBoardCardLink(user!, id, body);
    return r.ok ? NextResponse.json(r.value, { status: 201 }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    console.error("POST /api/admin/board/cards/[id]/links error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
