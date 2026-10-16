export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { createBoardCard } from "@/lib/board-actions";

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    // Part 39 (WS119): the validation and write live in board-actions.ts, shared with Marge.
    const r = await createBoardCard(user!, body as Record<string, unknown>);
    return r.ok ? NextResponse.json(r.value, { status: 201 }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (err) {
    console.error("POST /api/admin/board/cards error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
