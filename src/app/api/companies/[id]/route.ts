export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess, requireAdmin } from "@/lib/auth-guard";
import { auth } from "@/lib/auth";

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
                role: true,
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

    // Only admins can configure reminder settings
    if (
      body.reminderFrequencyDays !== undefined &&
      session?.user?.role === "ADMIN"
    ) {
      data.reminderFrequencyDays =
        body.reminderFrequencyDays === null ? null : Number(body.reminderFrequencyDays);
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
    const { error } = await requireAdmin();
    if (error) return error;

    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    await db.company.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/companies/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
