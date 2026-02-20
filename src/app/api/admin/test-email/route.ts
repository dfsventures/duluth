export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { auth } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";

export async function POST() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const session = await auth();
    const email = session?.user?.email;

    if (!email) {
      return NextResponse.json({ error: "No email on session" }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured. Add it to your .env.local file." },
        { status: 400 }
      );
    }

    await sendTestEmail(email);

    return NextResponse.json({ success: true, sentTo: email });
  } catch (err) {
    console.error("POST /api/admin/test-email error:", err);
    return NextResponse.json({ error: "Failed to send test email. Check your Resend configuration." }, { status: 500 });
  }
}
