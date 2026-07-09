export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { isSetupTokenExpired } from "@/lib/setup-token";

export async function POST(req: NextRequest) {
  try {
    if (!(await checkRateLimit("set-password", clientIp(req), 10))) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in an hour." },
        { status: 429 }
      );
    }

    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Find user by approval token
    const user = await db.user.findUnique({
      where: { approvalToken: token },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired token. Please contact support.", code: "TOKEN_INVALID" },
        { status: 400 }
      );
    }

    // A rejected user's outstanding link must not be able to activate the
    // account (F20) — indistinguishable from nonexistence, like the
    // F16 doc-proxy pattern.
    if (user.status === "REJECTED") {
      return NextResponse.json(
        { error: "Invalid or expired token. Please contact support.", code: "TOKEN_INVALID" },
        { status: 400 }
      );
    }

    // Check token expiry
    if (isSetupTokenExpired(user)) {
      return NextResponse.json(
        { error: "This link has expired. Please contact support for a new one.", code: "TOKEN_EXPIRED" },
        { status: 400 }
      );
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user: set password, approve, clear token
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: "APPROVED",
        approvalToken: null,
        tokenExpiresAt: null,
      },
    });

    return NextResponse.json({ success: true, email: user.email });
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * On-load precheck for /set-password so the expired/invalid card can render
 * before the founder types anything, instead of only after a failed submit.
 * Deliberately mirrors POST validity, not resend eligibility — member-added
 * reset links belong to users who already have a password and must still
 * validate here.
 */
export async function GET(req: NextRequest) {
  try {
    // Separate bucket from POST's — page loads must not burn submit attempts.
    if (!(await checkRateLimit("token-status", clientIp(req), 30))) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in an hour." },
        { status: 429 }
      );
    }

    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ valid: false, code: "TOKEN_INVALID" });
    }

    const user = await db.user.findUnique({ where: { approvalToken: token } });

    if (!user || user.status === "REJECTED") {
      return NextResponse.json({ valid: false, code: "TOKEN_INVALID" });
    }

    if (isSetupTokenExpired(user)) {
      return NextResponse.json({ valid: false, code: "TOKEN_EXPIRED" });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Set password precheck error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
