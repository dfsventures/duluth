export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

/** Reverses dismiss/route.ts — clears setupQueueDismissedAt. No email sent. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const user = await db.user.findUnique({ where: { id } });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updated = await db.user.update({
      where: { id },
      data: { setupQueueDismissedAt: null },
      select: { id: true, email: true, setupQueueDismissedAt: true },
    });

    await logAdminAction(actor!, "SETUP_QUEUE_UNDISMISSED", {
      targetType: "User",
      targetId: id,
      metadata: { email: updated.email },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("POST /api/admin/approvals/[id]/undismiss error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
