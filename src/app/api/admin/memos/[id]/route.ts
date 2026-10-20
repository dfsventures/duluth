export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { archiveMemo, isMetaBody, setMemoStatus, setMemoVisibility, updateMemoMeta, MEMO_MESSAGES } from "@/lib/memo-actions";
import { memoResponse, readObjectBody } from "@/lib/memo-route";
import { canEditMemo, canManageMemo, memoVisibleWhere, readCitations, readIntroCalls } from "@/lib/memos";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const memo = await db.memo.findFirst({
      where: { id, ...memoVisibleWhere(user!.id) },
      include: {
        company: { select: { id: true, name: true, website: true } },
        owner: { select: { id: true, name: true, email: true } },
        sections: { orderBy: { position: "asc" } },
      },
    });
    if (!memo) return NextResponse.json({ error: MEMO_MESSAGES.notFound }, { status: 404 });

    const { createKey: _ck, ...rest } = memo;
    void _ck;
    return NextResponse.json({
      ...rest,
      introCalls: readIntroCalls(memo.introCalls),
      sections: memo.sections.map((s) => ({ ...s, citations: readCitations(s.citations) })),
      canEdit: canEditMemo(memo, user!.id),
      canManage: canManageMemo(memo, user!.id),
    });
  } catch (err) {
    console.error("GET /api/admin/memos/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// One kind of change per request: status, or visibility, or metadata (with `version`).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const kinds = [("status" in body) as boolean, "visibility" in body, isMetaBody(body)].filter(Boolean).length;
    if (kinds > 1) return NextResponse.json({ error: "Send one kind of change at a time." }, { status: 400 });

    if ("status" in body) return memoResponse(await setMemoStatus(user!, id, body.status));
    if ("visibility" in body) return memoResponse(await setMemoVisibility(user!, id, body.visibility));
    if (isMetaBody(body)) return memoResponse(await updateMemoMeta(user!, id, body));
    return NextResponse.json({ error: MEMO_MESSAGES.nothing }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/admin/memos/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE archives (the owner only); nothing is hard-deleted.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    return memoResponse(await archiveMemo(user!, id));
  } catch (err) {
    console.error("DELETE /api/admin/memos/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
