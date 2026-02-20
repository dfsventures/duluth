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
        { error: "RESEND_API_KEY is not set. Add it to your environment variables." },
        { status: 400 }
      );
    }

    await sendTestEmail(email);

    return NextResponse.json({ success: true, sentTo: email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("POST /api/admin/test-email error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
