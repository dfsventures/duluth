export const dynamic = "force-dynamic";
export const maxDuration = 60; // F59 — the fan-out is the one long request in this app
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { resolveBroadcastRecipients } from "@/lib/broadcast-recipients";
import { sendCompanyBroadcastEmails } from "@/lib/email";

// Part 30, WS73 — the heart of the feature. Order of operations mirrors
// the report publish route: freeze → publish → best-effort send → audit
// → respond. Publish happens BEFORE send, exactly like the report route
// — a delivery failure must never leave the record unpublished.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const broadcast = await db.companyBroadcast.findUnique({
      where: { id },
      include: { targets: { include: { portfolioCompany: { select: { id: true, name: true } } } } },
    });
    if (!broadcast) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
    if (broadcast.status !== "DRAFT") {
      return NextResponse.json({ error: "Only a draft broadcast can be published." }, { status: 400 });
    }

    if (!broadcast.subject.trim()) {
      return NextResponse.json({ error: "Add a subject before sending." }, { status: 400 });
    }
    if (!broadcast.body.trim()) {
      return NextResponse.json({ error: "Add a body before sending." }, { status: 400 });
    }
    if (broadcast.targets.length === 0) {
      return NextResponse.json({ error: "Select at least one company before sending." }, { status: 400 });
    }

    const contacts = await db.portfolioCompanyContact.findMany({
      where: { portfolioCompanyId: { in: broadcast.targets.map((t) => t.portfolioCompanyId) } },
      include: { portfolioCompany: { select: { id: true, name: true } } },
    });
    const recipients = resolveBroadcastRecipients(
      contacts.map((c) => ({
        portfolioCompanyId: c.portfolioCompany.id,
        portfolioCompanyName: c.portfolioCompany.name,
        contact: { id: c.id, email: c.email, name: c.name },
      }))
    );

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "None of the selected companies has a contact — nothing would be sent. Add contacts on the company's page first." },
        { status: 400 }
      );
    }

    const published = await db.$transaction(async (tx) => {
      await tx.companyBroadcastRecipient.createMany({
        data: recipients.map((r) => ({
          broadcastId: id,
          contactId: r.contactId,
          email: r.email,
          name: r.name,
          portfolioCompanyIds: r.portfolioCompanyIds,
          status: "PENDING",
        })),
      });
      return tx.companyBroadcast.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
    });

    const results = await sendCompanyBroadcastEmails(
      recipients.map((r) => ({ email: r.email, recipientName: r.name, subject: broadcast.subject, bodyHtml: broadcast.body }))
    );

    const sentEmails = results.filter((r) => r.ok).map((r) => r.email);
    const failedResults = results.filter((r) => !r.ok);

    // Grouped by outcome — the SENT group shares one write; the FAILED
    // group is grouped further by identical error message (typically one
    // or a handful of distinct provider errors) and written concurrently,
    // so the write-back stays a small constant number of round-trips
    // rather than one per recipient (F59).
    const writes: Promise<unknown>[] = [];
    if (sentEmails.length > 0) {
      writes.push(
        db.companyBroadcastRecipient.updateMany({
          where: { broadcastId: id, email: { in: sentEmails } },
          data: { status: "SENT", sentAt: new Date() },
        })
      );
    }
    if (failedResults.length > 0) {
      const byError = new Map<string, string[]>();
      for (const f of failedResults) {
        const key = f.error ?? "Unknown error";
        const emails = byError.get(key) ?? [];
        emails.push(f.email);
        byError.set(key, emails);
      }
      for (const [errMsg, emails] of byError) {
        writes.push(
          db.companyBroadcastRecipient.updateMany({
            where: { broadcastId: id, email: { in: emails } },
            data: { status: "FAILED", error: errMsg },
          })
        );
      }
    }
    await Promise.all(writes);

    const sent = sentEmails.length;
    const failed = failedResults.length;

    await logAdminAction(user!, "BROADCAST_PUBLISHED", {
      targetType: "CompanyBroadcast",
      targetId: id,
      metadata: { companyCount: broadcast.targets.length, recipientCount: recipients.length, sent, failed },
    });

    return NextResponse.json({ ...published, sendResult: { recipientCount: recipients.length, sent, failed } });
  } catch (err) {
    console.error("POST /api/admin/broadcasts/[id]/publish error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
