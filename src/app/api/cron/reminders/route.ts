import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sendUpdateReminderEmail } from "@/lib/email";

// Vercel Cron invokes scheduled jobs with GET; POST is kept for manual
// testing with the CRON_SECRET. Both share the same handler.
async function handleReminders(req: NextRequest) {
  // Verify the request is from Vercel Cron (or a manual test with the secret)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Fetch all companies that have reminders enabled, along with their
  // last sent update and all OWNER/MEMBER members
  const companies = await db.company.findMany({
    where: {
      reminderFrequencyDays: { not: null },
    },
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

  let sent = 0;
  let skipped = 0;

  for (const company of companies) {
    const freqDays = company.reminderFrequencyDays!;

    // Skip companies newer than their own reminder window (grace period)
    const companyAgeMs = now.getTime() - company.createdAt.getTime();
    const companyAgeDays = companyAgeMs / 86_400_000;
    if (companyAgeDays < freqDays) {
      skipped++;
      continue;
    }

    // Determine days since last update
    const lastUpdateDate =
      company.updates[0]?.sentAt ?? company.createdAt;
    const daysSinceUpdate = Math.floor(
      (now.getTime() - lastUpdateDate.getTime()) / 86_400_000
    );

    // Skip if not yet overdue
    if (daysSinceUpdate < freqDays) {
      skipped++;
      continue;
    }

    // Skip if we sent a reminder within the last full period (cooldown)
    if (company.lastReminderSentAt) {
      const daysSinceReminder = Math.floor(
        (now.getTime() - company.lastReminderSentAt.getTime()) / 86_400_000
      );
      if (daysSinceReminder < freqDays) {
        skipped++;
        continue;
      }
    }

    // Send reminder to each OWNER/MEMBER
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
        console.error(
          `Failed to send reminder for ${company.name} to ${membership.user.email}:`,
          err
        );
      }
    }

    // Update the cooldown timestamp
    await db.company.update({
      where: { id: company.id },
      data: { lastReminderSentAt: now },
    });

    sent++;
  }

  console.log(`[cron/reminders] sent=${sent} skipped=${skipped}`);
  return Response.json({ sent, skipped });
}

export async function GET(req: NextRequest) {
  return handleReminders(req);
}

export async function POST(req: NextRequest) {
  return handleReminders(req);
}
