export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const link = await db.shareableLink.findUnique({ where: { token } });
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json({ error: "Link has expired" }, { status: 410 });
    }

    await db.shareableLinkView.create({
      data: {
        linkId: link.id,
        email: email.trim().toLowerCase(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/share/[token]/view error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
