export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { sendUpdateReminderEmail } from "@/lib/email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const company = await db.company.findUnique({
      where: { id },
      include: {
        updates: {
          where: { status: "SENT" },
          orderBy: { sentAt: "desc" },
          take: 1,
        },
        memberships: {
          where: { role: { in: ["OWNER", "MEMBER"] } },
          include: { user: true },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const lastUpdateDate = company.updates[0]?.sentAt ?? company.createdAt;
    const daysSinceUpdate = Math.floor(
      (Date.now() - lastUpdateDate.getTime()) / 86_400_000
    );

    for (const membership of company.memberships) {
      try {
        if (process.env.RESEND_API_KEY) {
          await sendUpdateReminderEmail({
            toEmail: membership.user.email,
            founderName: membership.user.name,
            companyName: company.name,
            daysSinceLastUpdate: daysSinceUpdate,
          });
        }
      } catch (err) {
        console.error(`Failed to send reminder to ${membership.user.email}:`, err);
      }
    }

    const now = new Date();
    await db.company.update({
      where: { id },
      data: { lastReminderSentAt: now },
    });

    return NextResponse.json({ lastReminderSentAt: now.toISOString() });
  } catch (err) {
    console.error("POST /api/companies/[id]/remind error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
