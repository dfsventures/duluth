export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.status === "REJECTED") {
      return NextResponse.json(
        { error: "User is already rejected" },
        { status: 400 }
      );
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: {
        status: "REJECTED",
        // F20: kill any outstanding setup token so a rejected user can't
        // still activate the account via a live link.
        approvalToken: null,
        tokenExpiresAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        status: true,
      },
    });

    // Send rejection email (non-blocking, only if email is configured)
    try {
      if (process.env.RESEND_API_KEY) {
        const { sendRejectionEmail } = await import("@/lib/email");
        await sendRejectionEmail(user.email);
      }
    } catch (emailError) {
      console.error("Failed to send rejection email:", emailError);
    }

    await logAdminAction(actor!, "USER_REJECTED", { targetType: "User", targetId: id, metadata: { email: updatedUser.email } });
    return NextResponse.json(updatedUser);
  } catch (err) {
    console.error("POST /api/admin/approvals/[id]/reject error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
