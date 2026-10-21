export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { linkCompany, unlinkCompany } from "@/lib/memo-actions";
import { memoResponse, readObjectBody } from "@/lib/memo-route";

// { expectedVersion, companyId } or { expectedVersion, portfolioCompanyId } (a deal-ledger row). Owner only.
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

// Q134-A: { expectedVersion }. Owner only. Back to "<name> · Not linked".
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return memoResponse(await unlinkCompany(user!, id, body));
  } catch (err) {
    console.error("DELETE /api/admin/memos/[id]/link-company error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
