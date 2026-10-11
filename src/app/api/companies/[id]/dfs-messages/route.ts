export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { listBroadcastsForCompany } from "@/lib/founder-broadcasts";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const { error } = await requireCompanyAccess(companyId);
    if (error) return error;

    const limitParam = new URL(request.url).searchParams.get("limit");
    const parsed = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : undefined;

    const data = await listBroadcastsForCompany(companyId, limit);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/companies/[id]/dfs-messages error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
