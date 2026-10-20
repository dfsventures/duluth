export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { sha256Hex } from "@/lib/memo-actions";

// Part 40 (WS128). The memo share page's "who viewed" log. The email is a courtesy prompt, not
// access control (F127): any well-formed address is recorded. Rate-limited per IP.

const MEMO_VIEW_LIMIT_PER_HOUR = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!(await checkRateLimit("memo-share-view", clientIp(request), MEMO_VIEW_LIMIT_PER_HOUR))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: NO_STORE });
    }
    const body = await request.json().catch(() => null);
    const email = body && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400, headers: NO_STORE });
    }
    if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Link not found" }, { status: 404, headers: NO_STORE });

    const link = await db.shareableLink.findUnique({
      where: { tokenHash: sha256Hex(token) },
      select: { id: true, expiresAt: true, revokedAt: true, memo: { select: { archivedAt: true } } },
    });
    if (!link || !link.memo) return NextResponse.json({ error: "Link not found" }, { status: 404, headers: NO_STORE });
    if (link.revokedAt || link.memo.archivedAt) return NextResponse.json({ error: "This link was turned off by the sender." }, { status: 410, headers: NO_STORE });
    if (link.expiresAt && link.expiresAt <= new Date()) return NextResponse.json({ error: "This link has expired." }, { status: 410, headers: NO_STORE });

    await db.shareableLinkView.create({ data: { linkId: link.id, email: email.trim().toLowerCase() } });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("POST /api/share/m/[token]/view error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}
