import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { name, email, companyName } = await req.json();

    if (!name || !email || !companyName) {
      return NextResponse.json(
        { error: "Name, email, and company name are required." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    const existing = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Create user, company, and membership in a transaction
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name,
          role: "FOUNDER",
          status: "PENDING",
        },
      });

      const company = await tx.company.create({
        data: {
          name: companyName,
          createdById: user.id,
        },
      });

      await tx.userCompanyMembership.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: "OWNER",
        },
      });
    });

    // Notify admins (don't fail the request if email fails)
    try {
      if (process.env.RESEND_API_KEY) {
        const { sendNewSignupNotification } = await import("@/lib/email");
        await sendNewSignupNotification(email, name);
      }
    } catch (emailError) {
      console.error("Failed to send signup notification email:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
