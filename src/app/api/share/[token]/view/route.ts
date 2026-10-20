export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Part 40 (WS130, F126): the view logger accepted any email with no limit.
const SHARE_VIEW_LIMIT_PER_HOUR = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!(await checkRateLimit("share-view", clientIp(request), SHARE_VIEW_LIMIT_PER_HOUR))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }
    const body = await request.json();
    const { email } = body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      !email ||
      typeof email !== "string" ||
      email.length > 254 ||
      !emailRegex.test(email.trim())
    ) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const link = await db.shareableLink.findUnique({ where: { token, memoId: null } });
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
