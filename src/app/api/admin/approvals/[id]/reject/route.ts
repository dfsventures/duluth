import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

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
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
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

    return NextResponse.json(updatedUser);
  } catch (err) {
    console.error("POST /api/admin/approvals/[id]/reject error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
