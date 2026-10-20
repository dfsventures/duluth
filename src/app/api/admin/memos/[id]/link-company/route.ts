export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { linkCompany } from "@/lib/memo-actions";
import { memoResponse, readObjectBody } from "@/lib/memo-route";

// { expectedVersion, companyId }. Owner only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return memoResponse(await linkCompany(user!, id, body));
  } catch (err) {
    console.error("POST /api/admin/memos/[id]/link-company error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
