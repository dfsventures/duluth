export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import crypto from "crypto";

export async function GET() {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const where =
      user!.roles.includes("ADMIN")
        ? {} // admins see all links
        : { createdById: user!.id };

    const links = await db.shareableLink.findMany({
      where,
      include: {
        companies: { include: { company: { select: { id: true, name: true } } } },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(links);
  } catch (err) {
    console.error("GET /api/links error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const body = await request.json();
    const { label, updateIds, expiresAt, metricScope } = body;

    if (!updateIds || !Array.isArray(updateIds) || updateIds.length === 0) {
      return NextResponse.json({ error: "At least one update is required" }, { status: 400 });
    }

    if (metricScope !== undefined && !["ALL_TIME", "PERIOD"].includes(metricScope)) {
      return NextResponse.json({ error: "Invalid metricScope" }, { status: 400 });
    }

    // Fetch selected updates — must all be published (SENT)
    const selectedUpdates = await db.update.findMany({
      where: { id: { in: updateIds }, status: "SENT" },
      include: { company: { select: { id: true } } },
      orderBy: { sentAt: "asc" },
    });

    if (selectedUpdates.length !== updateIds.length) {
      return NextResponse.json(
        { error: "Some updates were not found or are not published" },
        { status: 400 }
      );
    }

    // Founders can only share updates for their own companies
    const companyIds = [...new Set(selectedUpdates.map((u) => u.company.id))];
    if (!user!.roles.includes("ADMIN")) {
      const memberships = await db.userCompanyMembership.findMany({
        where: { userId: user!.id, companyId: { in: companyIds } },
      });
      if (memberships.length !== companyIds.length) {
        return NextResponse.json(
          { error: "You don't have access to one or more selected companies" },
          { status: 403 }
        );
      }
    }

    // Derive period from min/max sentAt of selected updates
    const sentDates = selectedUpdates.map((u) => u.sentAt).filter(Boolean) as Date[];
    const periodStart = sentDates.length > 0 ? sentDates[0] : new Date();
    const periodEnd = sentDates.length > 0 ? sentDates[sentDates.length - 1] : new Date();

    const token = crypto.randomBytes(24).toString("hex");

    const link = await db.shareableLink.create({
      data: {
        token,
        label: label?.trim() || null,
        createdById: user!.id,
        periodStart,
        periodEnd,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        metricScope: metricScope ?? "ALL_TIME",
        companies: {
          create: companyIds.map((id: string) => ({ companyId: id })),
        },
        selectedUpdates: {
          create: updateIds.map((id: string) => ({ updateId: id })),
        },
      },
      include: {
        companies: { include: { company: { select: { id: true, name: true } } } },
        _count: { select: { views: true } },
      },
    });

    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    console.error("POST /api/links error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
