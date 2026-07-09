export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { generateSetupToken, canResendSetupLink } from "@/lib/setup-token";

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

    if (!canResendSetupLink(user)) {
      return NextResponse.json(
        { error: "User is not awaiting password setup" },
        { status: 400 }
      );
    }

    const { token: approvalToken, tokenExpiresAt } = generateSetupToken();

    const updatedUser = await db.user.update({
      where: { id },
      data: {
        approvalToken,
        tokenExpiresAt,
      },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        status: true,
        tokenExpiresAt: true,
      },
    });

    // Send a fresh setup email (non-blocking, only if email is configured)
    try {
      if (process.env.RESEND_API_KEY) {
        const { sendApprovalEmail } = await import("@/lib/email");
        await sendApprovalEmail(user.email, approvalToken);
      }
    } catch (emailError) {
      console.error("Failed to resend setup email:", emailError);
    }

    await logAdminAction(actor!, "SETUP_LINK_RESENT", {
      targetType: "User",
      targetId: id,
      metadata: { email: updatedUser.email },
    });
    return NextResponse.json(updatedUser);
  } catch (err) {
    console.error("POST /api/admin/approvals/[id]/resend error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
