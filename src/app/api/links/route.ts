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
      user!.role === "ADMIN"
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
    const { label, companyIds, periodStart, periodEnd, expiresAt } = body;

    if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
      return NextResponse.json({ error: "At least one company is required" }, { status: 400 });
    }
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: "Period start and end are required" }, { status: 400 });
    }

    // Founders can only link their own companies
    if (user!.role !== "ADMIN") {
      const memberships = await db.userCompanyMembership.findMany({
        where: { userId: user!.id, companyId: { in: companyIds } },
      });
      if (memberships.length !== companyIds.length) {
        return NextResponse.json({ error: "You don't have access to one or more selected companies" }, { status: 403 });
      }
    }

    const token = crypto.randomBytes(24).toString("hex");

    const link = await db.shareableLink.create({
      data: {
        token,
        label: label?.trim() || null,
        createdById: user!.id,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        companies: {
          create: companyIds.map((id: string) => ({ companyId: id })),
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
