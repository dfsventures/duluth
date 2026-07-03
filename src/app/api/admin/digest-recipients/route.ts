export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const recipients = await db.digestExtraRecipient.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(recipients);
  } catch (err) {
    console.error("GET /api/admin/digest-recipients error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const { email } = await request.json() as { email: string };
    if (!email?.trim() || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const recipient = await db.digestExtraRecipient.upsert({
      where: { email: email.trim().toLowerCase() },
      create: {
        id: crypto.randomUUID().replace(/-/g, "").slice(0, 25),
        email: email.trim().toLowerCase(),
      },
      update: {},
    });

    await logAdminAction(user!, "DIGEST_RECIPIENT_ADDED", { targetType: "DigestExtraRecipient", targetId: recipient.id, metadata: { email: recipient.email } });
    return NextResponse.json(recipient, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/digest-recipients error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
