export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { getBroadcastForCompany } from "@/lib/founder-broadcasts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id: companyId, messageId } = await params;
    const { error } = await requireCompanyAccess(companyId);
    if (error) return error;

    const message = await getBroadcastForCompany(companyId, messageId);
    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(message);
  } catch (err) {
    console.error("GET /api/companies/[id]/dfs-messages/[messageId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
