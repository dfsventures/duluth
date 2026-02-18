import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { randomUUID } from "crypto";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.status !== "PENDING") {
      return NextResponse.json(
        { error: "User is not in PENDING status" },
        { status: 400 }
      );
    }

    const approvalToken = randomUUID();
    const tokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

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
        role: true,
        status: true,
        approvalToken: true,
        tokenExpiresAt: true,
      },
    });

    // Send approval email (non-blocking, only if email is configured)
    try {
      if (process.env.RESEND_API_KEY) {
        const { sendApprovalEmail } = await import("@/lib/email");
        await sendApprovalEmail(user.email, approvalToken);
      }
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError);
    }

    return NextResponse.json(updatedUser);
  } catch (err) {
    console.error("POST /api/admin/approvals/[id]/approve error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
