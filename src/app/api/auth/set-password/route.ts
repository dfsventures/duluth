import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
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
        { error: "Invalid or expired token. Please contact support." },
        { status: 400 }
      );
    }

    // Check token expiry
    if (user.tokenExpiresAt && new Date() > user.tokenExpiresAt) {
      return NextResponse.json(
        { error: "This link has expired. Please contact support for a new one." },
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
