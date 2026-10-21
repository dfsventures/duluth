export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { setMemoDecision } from "@/lib/memo-actions";
import { memoResponse, readObjectBody } from "@/lib/memo-route";

// Part 43: { decision: one of MEMO_DECISIONS | null, expectedVersion, undo? }. Whoever may edit the memo (canEditMemo).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return memoResponse(await setMemoDecision(user!, id, body));
  } catch (err) {
    console.error("POST /api/admin/memos/[id]/decision error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
