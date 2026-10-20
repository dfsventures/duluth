export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { addSection, reorderSections } from "@/lib/memo-actions";
import { memoResponse, readObjectBody } from "@/lib/memo-route";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return memoResponse(await addSection(user!, id, body), 201);
  } catch (err) {
    console.error("POST /api/admin/memos/[id]/sections error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Reorder: { keys: [every section key, in the new order] }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return memoResponse(await reorderSections(user!, id, body.keys));
  } catch (err) {
    console.error("PATCH /api/admin/memos/[id]/sections error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
