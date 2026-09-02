export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { sendCompanyBroadcastEmail } from "@/lib/email";

// Part 30, WS73 / JC-BC-F — "send a test to myself" before publish. The
// safety valve for an irreversible action. Never touches status or
// recipient rows.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const broadcast = await db.companyBroadcast.findUnique({ where: { id } });
    if (!broadcast) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

    if (!broadcast.subject.trim() || !broadcast.body.trim()) {
      return NextResponse.json({ error: "Add a subject and body before sending a test." }, { status: 400 });
    }
    if (!user!.email) {
      return NextResponse.json({ error: "Your account has no email address to send a test to." }, { status: 400 });
    }

    await sendCompanyBroadcastEmail({
      email: user!.email,
      recipientName: user!.name ?? null,
      subject: broadcast.subject,
      bodyHtml: broadcast.body,
    });

    await logAdminAction(user!, "BROADCAST_TEST_SENT", {
      targetType: "CompanyBroadcast",
      targetId: id,
      metadata: { sentTo: user!.email },
    });
    return NextResponse.json({ ok: true, sentTo: user!.email });
  } catch (err) {
    console.error("POST /api/admin/broadcasts/[id]/test error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
