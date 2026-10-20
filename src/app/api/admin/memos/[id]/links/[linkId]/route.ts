export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { revokeShareLink } from "@/lib/memo-actions";
import { memoResponse } from "@/lib/memo-route";

// Revoke: a soft delete. The link answers 410 from now on and keeps its view log.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const { id, linkId } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    return memoResponse(await revokeShareLink(user!, id, linkId));
  } catch (err) {
    console.error("DELETE /api/admin/memos/[id]/links/[linkId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
