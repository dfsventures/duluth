export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess, requireAdmin } from "@/lib/auth-guard";
import { auth } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const company = await db.company.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                roles: true,
                image: true,
              },
            },
          },
        },
        updates: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            period: true,
            title: true,
            status: true,
            sentAt: true,
            createdAt: true,
            createdById: true,
          },
        },
        metricDefinitions: {
          orderBy: { createdAt: "asc" },
        },
        documents: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            isInternal: true,
            createdAt: true,
            uploadedById: true,
          },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (err) {
    console.error("GET /api/companies/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const session = await auth();
    const body = await request.json();
    const allowedFields = [
      "name",
      "description",
      "website",
      "sector",
      "geography",
      "fundingStage",
      "logo",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
      }
    }

    // Only admins can configure reminder settings and aliases
    if (session?.user?.roles?.includes("ADMIN")) {
      if (body.reminderFrequencyDays !== undefined) {
        data.reminderFrequencyDays =
          body.reminderFrequencyDays === null ? null : Number(body.reminderFrequencyDays);
      }
      if (Array.isArray(body.aliases)) {
        data.aliases = body.aliases;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const company = await db.company.update({
      where: { id },
      data,
    });

    return NextResponse.json(company);
  } catch (err) {
    console.error("PATCH /api/companies/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.company.findUnique({
      where: { id },
      include: { memberships: { select: { userId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Part 16, WS43 (Q57, corrected — the founder-account cleanup below
    // was added after discovering DELETE alone never removed the
    // founder's account, contrary to the original plan's assumption).
    // Narrowly scoped to DILIGENCE-stage companies only — an ordinary
    // ACTIVE-company delete is byte-identical to before this change.
    const candidateFounderIds =
      existing.stage === "DILIGENCE"
        ? [...new Set(existing.memberships.map((m) => m.userId))]
        : [];

    await db.company.delete({ where: { id } });

    // Best-effort, deliberately NOT part of one hard DB transaction with
    // the delete above: a DD founder has full, non-blocking dashboard
    // access from day one (Q55), including Investor Links — so they may
    // already own rows this fresh account doesn't exclusively belong to,
    // e.g. a ShareableLink (createdById is a required FK with no
    // cascade, and a link isn't owned 1:1 by Company — it survives this
    // company's deletion via its join table). A user-delete blocked by
    // that kind of unrelated FK must never fail or roll back the company
    // deletion itself, which has to keep behaving exactly as reliably as
    // it does today for every company, DD or not.
    //
    // F35 (2026-08-03 audit): the original version of this loop swallowed
    // ShareableLink-caused delete failures entirely — company still
    // deleted, API still said success, no signal the founder account
    // survived. Fixed two ways: (1) a founder's ShareableLink that no
    // longer references *any* company (its only ShareableLinkCompany row
    // was the one that just cascaded away with this company's delete) is
    // safe to remove outright — it only ever pointed at the deal that
    // just fell through, so there's no data worth preserving via it. A
    // link that still references another, still-active company is left
    // alone on purpose (it's still serving that company) and the
    // resulting user-delete failure is (2) reported, not swallowed — via
    // both the audit log and the response body.
    const deletedFounderEmails: string[] = [];
    const retainedFounderAccounts: string[] = [];
    for (const userId of candidateFounderIds) {
      const remainingMemberships = await db.userCompanyMembership.count({
        where: { userId },
      });
      if (remainingMemberships > 0) continue; // still part of another real company — leave them alone

      const founder = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, roles: true },
      });
      if (!founder || founder.roles.includes("ADMIN")) continue; // never auto-delete an admin account

      try {
        const founderLinks = await db.shareableLink.findMany({
          where: { createdById: userId },
          include: { _count: { select: { companies: true } } },
        });
        for (const link of founderLinks) {
          if (link._count.companies === 0) {
            await db.shareableLink.delete({ where: { id: link.id } });
          }
          // else: still referenced by another still-active company —
          // leave it (and therefore the founder account) alone.
        }

        await db.user.delete({ where: { id: userId } });
        deletedFounderEmails.push(founder.email);
      } catch (cleanupErr) {
        console.error(`DELETE /api/companies/[id]: founder-account cleanup failed for user ${userId}:`, cleanupErr);
        retainedFounderAccounts.push(founder.email);
      }
    }

    await logAdminAction(user!, "COMPANY_DELETED", {
      targetType: "Company",
      targetId: id,
      metadata: {
        name: existing.name,
        ...(deletedFounderEmails.length > 0 ? { founderAccountsDeleted: deletedFounderEmails } : {}),
        ...(retainedFounderAccounts.length > 0 ? { founderAccountsRetained: retainedFounderAccounts } : {}),
      },
    });
    return NextResponse.json({
      success: true,
      ...(deletedFounderEmails.length > 0 ? { founderAccountsDeleted: deletedFounderEmails } : {}),
      ...(retainedFounderAccounts.length > 0 ? { founderAccountsRetained: retainedFounderAccounts } : {}),
    });
  } catch (err) {
    console.error("DELETE /api/companies/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
