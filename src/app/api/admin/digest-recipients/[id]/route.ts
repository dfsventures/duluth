export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const deleted = await db.digestExtraRecipient.delete({ where: { id } });
    await logAdminAction(user!, "DIGEST_RECIPIENT_REMOVED", { targetType: "DigestExtraRecipient", targetId: id, metadata: { email: deleted.email } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/admin/digest-recipients/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
