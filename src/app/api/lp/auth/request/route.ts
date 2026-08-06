export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { newOtpCode, sha256, OTP_TTL_MS, LP_EMAIL_REGEX } from "@/lib/lp-auth";
import { sendLpOtpEmail } from "@/lib/email";

// JC7: identical generic response whether or not the email belongs to an
// LP — LP lists are confidential, and the repo (and thus this endpoint's
// existence) is public, so no branch may leak an existence oracle.
const GENERIC_RESPONSE = {
  ok: true,
  message: "If this address receives fund reports from us, a code is on its way.",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !LP_EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    }

    if (!(await checkRateLimit("lp-otp-ip", clientIp(req), 10))) {
      return NextResponse.json({ error: "Too many requests. Try again in an hour." }, { status: 429 });
    }
    if (!(await checkRateLimit("lp-otp-email", email, 5))) {
      return NextResponse.json({ error: "Too many requests. Try again in an hour." }, { status: 429 });
    }

    // Part 26 (WS59, D1): resolve through LpEmail rather than
    // LimitedPartner.email so ANY of an LP's addresses can request a code.
    // The OTP row is keyed off lpId, not the email string, so nothing
    // downstream changes.
    const match = await db.lpEmail.findUnique({ where: { email }, select: { lpId: true } });
    if (match) {
      const code = newOtpCode();
      await db.lpOtpCode.create({
        data: { lpId: match.lpId, codeHash: sha256(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      });
      try {
        await sendLpOtpEmail(email, code);
      } catch (emailError) {
        // Send failure is logged but still returns the generic 200 (JC7).
        console.error("Failed to send LP OTP email:", emailError);
      }
    }

    // Opportunistic cleanup of stale OTP rows (~1% of calls), same trick as rate-limit.ts.
    if (Math.random() < 0.01) {
      db.lpOtpCode.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (err) {
    console.error("POST /api/lp/auth/request error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
