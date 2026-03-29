export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { sendUpdatePublishedEmail } from "@/lib/email";

export async function DELETE(
  _request: Request,
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

    if (existing.status === "SENT") {
      return NextResponse.json({ error: "Published updates cannot be deleted" }, { status: 403 });
    }

    await db.update.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/updates/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
                roles: true,
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
            docType: true,
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
      select: { companyId: true, status: true, sentAt: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { error } = await requireCompanyAccess(existing.companyId);
    if (error) return error;

    // Published updates are editable for 3 days after sentAt
    if (existing.status === "SENT") {
      const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
      const sentAt = existing.sentAt ? existing.sentAt.getTime() : 0;
      if (Date.now() - sentAt > THREE_DAYS_MS) {
        return NextResponse.json(
          { error: "Published updates can only be edited within 3 days of publishing." },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.period !== undefined) data.period = body.period;
    if (body.body !== undefined) data.body = body.body;
    if (body.status !== undefined) {
      if (!["DRAFT", "SENT"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = body.status;
      if (body.status === "SENT" && existing.status !== "SENT") {
        data.sentAt = new Date();
      }
    }

    if (Object.keys(data).length === 0 && !body.metricValues) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Update fields and optionally replace metric values in a transaction
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.update.update({ where: { id }, data });

      if (Array.isArray(body.metricValues) && body.metricValues.length > 0) {
        // Remove old metric values for this update and replace with new ones
        await tx.metricValue.deleteMany({ where: { updateId: id } });
        await tx.metricValue.createMany({
          data: body.metricValues.map((mv: { metricDefinitionId: string; value: number; date: string }) => ({
            metricDefinitionId: mv.metricDefinitionId,
            value: mv.value,
            date: new Date(mv.date),
            updateId: id,
          })),
        });
      }

      return result;
    });

    // Send email if this PATCH just published the update
    const justPublished = body.status === "SENT" && existing.status !== "SENT";
    if (justPublished) {
      try {
        const full = await db.update.findUnique({
          where: { id },
          include: {
            company: { select: { id: true, name: true } },
            metricValues: {
              include: { metricDefinition: { select: { name: true, unit: true } } },
            },
          },
        });
        if (full) {
          await sendUpdatePublishedEmail({
            companyName: full.company.name,
            companyId: full.company.id,
            updateId: full.id,
            title: full.title,
            period: full.period,
            body: full.body,
            metrics: full.metricValues.map((mv) => ({
              name: mv.metricDefinition.name,
              unit: mv.metricDefinition.unit,
              value: Number(mv.value),
            })),
          });
        }
      } catch (emailErr) {
        console.error("Failed to send publish email:", emailErr);
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/updates/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
