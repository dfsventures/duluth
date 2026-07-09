export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { sha256, newSessionToken, isOtpUsable, LP_COOKIE, LP_SESSION_DAYS } from "@/lib/lp-auth";

// One generic message for every failure mode — no oracle distinguishing
// "no such LP" from "wrong code" from "expired" from "too many attempts".
const GENERIC_ERROR = "That code is invalid or has expired.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email || !code) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    if (!(await checkRateLimit("lp-verify-ip", clientIp(req), 20))) {
      return NextResponse.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });
    }
    if (!(await checkRateLimit("lp-verify-email", email, 10))) {
      return NextResponse.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });
    }

    const lp = await db.limitedPartner.findUnique({ where: { email } });
    if (!lp) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const otp = await db.lpOtpCode.findFirst({
      where: { lpId: lp.id, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    // Fail-closed: increment attempts BEFORE comparing, regardless of
    // outcome. The Postgres rate limiter fails OPEN on DB errors — this
    // cap lives on the OTP row itself and cannot.
    const updatedOtp = await db.lpOtpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    if (!isOtpUsable(updatedOtp)) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const expectedBuf = Buffer.from(otp.codeHash, "hex");
    const candidateBuf = Buffer.from(sha256(code), "hex");
    const matches =
      expectedBuf.length === candidateBuf.length && crypto.timingSafeEqual(expectedBuf, candidateBuf);

    if (!matches) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + LP_SESSION_DAYS * 24 * 60 * 60 * 1000);

    await db.$transaction([
      db.lpOtpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      db.lpSession.create({ data: { token, lpId: lp.id, expiresAt } }),
    ]);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(LP_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: LP_SESSION_DAYS * 24 * 60 * 60,
    });
    return response;
  } catch (err) {
    console.error("POST /api/lp/auth/verify error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
