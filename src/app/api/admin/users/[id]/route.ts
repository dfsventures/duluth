export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user: actor, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { receivesDigest } = body as { receivesDigest: boolean };

    const targetUser = await db.user.update({
      where: { id },
      data: { receivesDigest },
      select: { id: true, name: true, email: true, receivesDigest: true },
    });

    await logAdminAction(actor!, "ADMIN_DIGEST_SUBSCRIPTION_UPDATED", { targetType: "User", targetId: id, metadata: { receivesDigest } });
    return NextResponse.json(targetUser);
  } catch (err) {
    console.error("PATCH /api/admin/users/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
