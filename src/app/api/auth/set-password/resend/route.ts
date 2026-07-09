export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { generateSetupToken, canResendSetupLink } from "@/lib/setup-token";

/**
 * Self-serve "email me a fresh link" for an expired/invalid setup link.
 * Token-keyed, not email-keyed (JC10): the founder reaches this button from
 * the expired link itself, so possessing the (expired) token is the entry
 * path — no email input, no account-existence oracle. The response is
 * always neutral so a stale, ineligible, or unknown token is indistinguishable
 * from a successful resend.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await checkRateLimit("resend-setup", clientIp(req), 5))) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in an hour." },
        { status: 429 }
      );
    }

    const { token } = await req.json();

    if (typeof token === "string" && token.length > 0) {
      const user = await db.user.findUnique({ where: { approvalToken: token } });
      if (user && canResendSetupLink(user)) {
        const { token: fresh, tokenExpiresAt } = generateSetupToken();
        await db.user.update({
          where: { id: user.id },
          data: { approvalToken: fresh, tokenExpiresAt },
        });
        try {
          if (process.env.RESEND_API_KEY) {
            const { sendApprovalEmail } = await import("@/lib/email");
            // Stored address only — never client-supplied (JC10/JC11).
            await sendApprovalEmail(user.email, fresh);
          }
        } catch (emailError) {
          console.error("Failed to resend setup email:", emailError);
        }
      }
    }

    // Always neutral — success is indistinguishable from a no-op.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Set-password resend error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
