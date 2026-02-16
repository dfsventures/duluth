import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendNewSignupNotification } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { name, email, companyName } = await req.json();

    if (!name || !email || !companyName) {
      return NextResponse.json(
        { error: "Name, email, and company name are required." },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Create pending user
    await db.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        role: "FOUNDER",
        status: "PENDING",
        companies: {
          create: {
            name: companyName,
          },
        },
      },
    });

    // Notify admins (don't fail the request if email fails)
    try {
      await sendNewSignupNotification(email, name);
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
