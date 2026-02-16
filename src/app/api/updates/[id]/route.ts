import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First fetch the update to get companyId for access check
    const update = await db.update.findUnique({
      where: { id },
      select: { companyId: true },
    });

    if (!update) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { error } = await requireCompanyAccess(update.companyId);
    if (error) return error;

    const fullUpdate = await db.update.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logo: true,
            sector: true,
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                image: true,
              },
            },
          },
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
          },
        },
        metricValues: {
          include: {
            metricDefinition: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(fullUpdate);
  } catch (err) {
    console.error("GET /api/updates/[id] error:", err);
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

    const existing = await db.update.findUnique({
      where: { id },
      select: { companyId: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { error } = await requireCompanyAccess(existing.companyId);
    if (error) return error;

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      data.title = body.title;
    }
    if (body.body !== undefined) {
      data.body = body.body;
    }
    if (body.status !== undefined) {
      const validStatuses = ["DRAFT", "SENT"];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: "Invalid status" },
          { status: 400 }
        );
      }
      data.status = body.status;

      // If status changes to SENT, set sentAt
      if (body.status === "SENT" && existing.status !== "SENT") {
        data.sentAt = new Date();
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await db.update.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/updates/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
