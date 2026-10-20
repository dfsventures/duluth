export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { removeSection, saveSection } from "@/lib/memo-actions";
import { memoResponse, readObjectBody } from "@/lib/memo-route";

type Ctx = { params: Promise<{ id: string; key: string }> };

// Save: { expectedVersion, title?, markdown?, citations?, includeInShare? }. A stale version is a 409.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, key } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return memoResponse(await saveSection(user!, id, key, body));
  } catch (err) {
    console.error("PATCH /api/admin/memos/[id]/sections/[key] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, key } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    return memoResponse(await removeSection(user!, id, key));
  } catch (err) {
    console.error("DELETE /api/admin/memos/[id]/sections/[key] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
