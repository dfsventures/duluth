export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { sendWeeklyDigestEmail, BASE_URL } from "@/lib/email";
import { slackDigestEnabled, postToSlack, buildDigestSlackText } from "@/lib/slack";
import { logAdminAction } from "@/lib/audit";
import { buildDigestActionItems } from "@/lib/board-server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    // WS108.7: refresh the linked rows from the board just before sending (no-op once sent).
    const pre = await db.weeklyDigest.findUnique({ where: { id }, select: { sentAt: true } });
    if (pre && !pre.sentAt) await buildDigestActionItems(id);

    const digest = await db.weeklyDigest.findUnique({
      where: { id },
      include: {
        todos: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            card: { select: { dueDate: true } },
          },
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
      assigneeName: t.assignee?.name ?? t.assignee?.email ?? t.ownerLabel ?? null,
      projectLabel: t.projectLabel ?? null,
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

    // WS111.2 (F110): Slack never blocks email, and slackPostedAt means a Resend
    // never double-posts. A failed post leaves it null, so the next Send retries.
    // The webhook URL is a secret and is never logged or returned.
    let slack: "disabled" | "posted" | "already-posted" | "failed" = "disabled";
    if (slackDigestEnabled()) {
      if (digest.slackPostedAt) {
        slack = "already-posted";
      } else {
        try {
          const open = digest.todos.filter((t) => !t.completed);
          const r = await postToSlack(
            buildDigestSlackText({
              title: digest.title,
              digestUrl: `${BASE_URL}/admin/digest/${id}`,
              boardUrl: `${BASE_URL}/admin/board`,
              items: open.map((t) => ({
                title: t.text,
                ownerLabel: t.assignee?.name ?? t.assignee?.email ?? t.ownerLabel ?? null,
                projectLabel: t.projectLabel ?? null,
                dueDate: t.card?.dueDate ?? null,
              })),
            })
          );
          if (r.ok) {
            await db.weeklyDigest.update({ where: { id }, data: { slackPostedAt: new Date() } });
            slack = "posted";
          } else {
            slack = "failed";
            console.error("[digest/send] slack post failed:", r.error);
          }
        } catch (err) {
          slack = "failed";
          console.error("[digest/send] slack post failed:", err instanceof Error ? err.name : "unknown");
        }
      }
    }

    await logAdminAction(user!, "DIGEST_SENT", { targetType: "WeeklyDigest", targetId: id, metadata: { recipientCount: recipients.length, slack } });
    return NextResponse.json({ sentAt: now.toISOString(), slack });
  } catch (err) {
    console.error("POST /api/admin/digest/[id]/send error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
