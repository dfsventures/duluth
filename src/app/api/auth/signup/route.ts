export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { generateSetupToken, isSetupTokenExpired, canResendSetupLink } from "@/lib/setup-token";

export async function POST(req: NextRequest) {
  try {
    if (!(await checkRateLimit("signup", clientIp(req), 10))) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in an hour." },
        { status: 429 }
      );
    }

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
      // Stuck state: awaiting password setup — resend the setup email.
      // Written against the real state machine (F19): an admin-approved
      // signup founder is PENDING + token, not APPROVED, so this must key
      // off canResendSetupLink() rather than status === "APPROVED" alone.
      if (canResendSetupLink(existing)) {
        const tokenExpired = isSetupTokenExpired(existing);
        let activeToken: string;
        if (existing.approvalToken && !tokenExpired) {
          activeToken = existing.approvalToken;
        } else {
          const generated = generateSetupToken();
          activeToken = generated.token;
          await db.user.update({
            where: { id: existing.id },
            data: {
              approvalToken: generated.token,
              tokenExpiresAt: generated.tokenExpiresAt,
            },
          });
        }
        try {
          if (process.env.RESEND_API_KEY) {
            const { sendApprovalEmail } = await import("@/lib/email");
            await sendApprovalEmail(existing.email, activeToken);
          }
        } catch (emailError) {
          console.error("Failed to resend setup email:", emailError);
        }
        return NextResponse.json({ success: true });
      }

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
          roles: ["FOUNDER"],
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
