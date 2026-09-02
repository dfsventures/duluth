export const dynamic = "force-dynamic";
export const maxDuration = 60; // F59 — same fan-out shape as publish
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { sendCompanyBroadcastEmails } from "@/lib/email";

// Part 30, WS73 / D8 — re-sends only recipient rows whose status is
// PENDING or FAILED. Idempotent: an already-SENT row is never re-sent,
// so a double-click cannot double-mail anyone.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const broadcast = await db.companyBroadcast.findUnique({ where: { id } });
    if (!broadcast) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
    if (broadcast.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Only a published broadcast can be retried." }, { status: 400 });
    }

    const toRetry = await db.companyBroadcastRecipient.findMany({
      where: { broadcastId: id, status: { in: ["PENDING", "FAILED"] } },
    });

    if (toRetry.length === 0) {
      return NextResponse.json({ ok: true, attempted: 0, sent: 0, failed: 0 });
    }

    const results = await sendCompanyBroadcastEmails(
      toRetry.map((r) => ({ email: r.email, recipientName: r.name, subject: broadcast.subject, bodyHtml: broadcast.body }))
    );

    const sentEmails = results.filter((r) => r.ok).map((r) => r.email);
    const failedResults = results.filter((r) => !r.ok);

    const writes: Promise<unknown>[] = [];
    if (sentEmails.length > 0) {
      writes.push(
        db.companyBroadcastRecipient.updateMany({
          where: { broadcastId: id, email: { in: sentEmails } },
          data: { status: "SENT", sentAt: new Date(), error: null },
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

    const attempted = toRetry.length;
    const sent = sentEmails.length;
    const failed = failedResults.length;

    await logAdminAction(user!, "BROADCAST_RETRIED", {
      targetType: "CompanyBroadcast",
      targetId: id,
      metadata: { attempted, sent, failed },
    });

    return NextResponse.json({ ok: true, attempted, sent, failed });
  } catch (err) {
    console.error("POST /api/admin/broadcasts/[id]/retry error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
