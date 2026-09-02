export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { resolveBroadcastRecipients } from "@/lib/broadcast-recipients";

// Part 30, WS73 — the live recipient preview. For a DRAFT, this
// recomputes from the current contact list (so it reflects edits made
// after the broadcast was created); for a PUBLISHED broadcast it returns
// the frozen CompanyBroadcastRecipient rows instead — the recorded truth,
// never a recomputation (a contact could have been edited or deleted
// since the send).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const broadcast = await db.companyBroadcast.findUnique({
      where: { id },
      include: { targets: { include: { portfolioCompany: { select: { id: true, name: true } } } } },
    });
    if (!broadcast) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

    const companyCount = broadcast.targets.length;

    if (broadcast.status === "PUBLISHED") {
      const recipients = await db.companyBroadcastRecipient.findMany({
        where: { broadcastId: id },
        orderBy: { email: "asc" },
      });
      return NextResponse.json({
        companyCount,
        recipientCount: recipients.length,
        companiesWithNoContacts: null, // not meaningful after publish — targeting is frozen history
        recipients: recipients.map((r) => ({
          email: r.email,
          name: r.name,
          portfolioCompanyIds: r.portfolioCompanyIds,
          status: r.status,
          error: r.error,
          sentAt: r.sentAt,
        })),
      });
    }

    const portfolioCompanyIds = broadcast.targets.map((t) => t.portfolioCompanyId);
    const contacts = await db.portfolioCompanyContact.findMany({
      where: { portfolioCompanyId: { in: portfolioCompanyIds } },
      include: { portfolioCompany: { select: { id: true, name: true } } },
    });

    const recipients = resolveBroadcastRecipients(
      contacts.map((c) => ({
        portfolioCompanyId: c.portfolioCompany.id,
        portfolioCompanyName: c.portfolioCompany.name,
        contact: { id: c.id, email: c.email, name: c.name },
      }))
    );

    const companiesWithContacts = new Set(contacts.map((c) => c.portfolioCompanyId));
    const companiesWithNoContacts = broadcast.targets.filter((t) => !companiesWithContacts.has(t.portfolioCompanyId)).length;

    return NextResponse.json({
      companyCount,
      recipientCount: recipients.length,
      companiesWithNoContacts,
      recipients: recipients.map((r) => ({
        email: r.email,
        name: r.name,
        portfolioCompanyIds: r.portfolioCompanyIds,
        portfolioCompanyNames: r.portfolioCompanyNames,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/broadcasts/[id]/recipients error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
