export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { listRevisions, restoreSection } from "@/lib/memo-actions";
import { memoResponse, readObjectBody } from "@/lib/memo-route";

type Ctx = { params: Promise<{ id: string; key: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id, key } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    return memoResponse(await listRevisions(user!, id, key));
  } catch (err) {
    console.error("GET /api/admin/memos/[id]/sections/[key]/revisions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Restore: { fromVersion, expectedVersion } writes a NEW version holding the old copy.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id, key } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return memoResponse(await restoreSection(user!, id, key, body.fromVersion, body.expectedVersion));
  } catch (err) {
    console.error("POST /api/admin/memos/[id]/sections/[key]/revisions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
