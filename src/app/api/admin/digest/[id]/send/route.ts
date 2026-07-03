export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { sendWeeklyDigestEmail } from "@/lib/email";
import { logAdminAction } from "@/lib/audit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const digest = await db.weeklyDigest.findUnique({
      where: { id },
      include: {
        todos: {
          include: { assignee: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!digest) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [adminRecipients, extraRecipients] = await Promise.all([
      db.user.findMany({
        where: { roles: { has: "ADMIN" }, receivesDigest: true },
        select: { email: true },
      }),
      db.digestExtraRecipient.findMany({ select: { email: true } }),
    ]);

    const allEmails = [
      ...adminRecipients.map((r) => r.email),
      ...extraRecipients.map((r) => r.email),
    ];

    if (allEmails.length === 0) {
      return NextResponse.json({ error: "No digest recipients configured" }, { status: 400 });
    }

    const recipients = allEmails.map((email) => ({ email }));

    const sections = digest.sections as { id: string; heading: string; content: string }[];
    const todos = digest.todos.map((t) => ({
      text: t.text,
      completed: t.completed,
      assigneeName: t.assignee?.name ?? t.assignee?.email ?? null,
    }));

    for (const { email } of recipients) {
      try {
        await sendWeeklyDigestEmail({ toEmail: email, title: digest.title, sections, todos });
      } catch (err) {
        console.error(`Failed to send digest to ${email}:`, err);
      }
    }

    const now = new Date();
    await db.weeklyDigest.update({ where: { id }, data: { sentAt: now } });

    await logAdminAction(user!, "DIGEST_SENT", { targetType: "WeeklyDigest", targetId: id, metadata: { recipientCount: recipients.length } });
    return NextResponse.json({ sentAt: now.toISOString() });
  } catch (err) {
    console.error("POST /api/admin/digest/[id]/send error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
