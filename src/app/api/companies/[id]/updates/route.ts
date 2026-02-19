export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { sendUpdatePublishedEmail } from "@/lib/email";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const updates = await db.update.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "desc" },
      ...(limit && limit > 0 ? { take: limit } : {}),
      include: {
        _count: {
          select: {
            comments: true,
            documents: true,
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

    return NextResponse.json(updates);
  } catch (err) {
    console.error("GET /api/companies/[id]/updates error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    const body = await request.json();
    const { period, title, body: updateBody, status, metrics } = body;

    if (!period || typeof period !== "string") {
      return NextResponse.json(
        { error: "Period is required" },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (!updateBody || typeof updateBody !== "string") {
      return NextResponse.json(
        { error: "Body is required" },
        { status: 400 }
      );
    }

    const validStatuses = ["DRAFT", "SENT"];
    const updateStatus = status && validStatuses.includes(status) ? status : "DRAFT";

    const update = await db.$transaction(async (tx: TransactionClient) => {
      const newUpdate = await tx.update.create({
        data: {
          companyId: id,
          createdById: user!.id,
          period: period.trim(),
          title: title.trim(),
          body: updateBody,
          status: updateStatus,
          sentAt: updateStatus === "SENT" ? new Date() : null,
        },
      });

      // Create metric values if provided
      if (Array.isArray(metrics) && metrics.length > 0) {
        const metricData = metrics.map(
          (m: { metricDefinitionId: string; value: number; date: string }) => ({
            metricDefinitionId: m.metricDefinitionId,
            value: m.value,
            date: new Date(m.date),
            updateId: newUpdate.id,
          })
        );

        await tx.metricValue.createMany({
          data: metricData,
        });
      }

      return newUpdate;
    });

    // Fetch the full update with relations
    const fullUpdate = await db.update.findUnique({
      where: { id: update.id },
      include: {
        metricValues: {
          include: { metricDefinition: true },
        },
        _count: {
          select: {
            comments: true,
            documents: true,
          },
        },
      },
    });

    // Send email if published immediately
    if (updateStatus === "SENT" && fullUpdate) {
      try {
        const company = await db.company.findUnique({
          where: { id },
          select: { name: true },
        });
        if (company) {
          await sendUpdatePublishedEmail({
            companyName: company.name,
            companyId: id,
            updateId: fullUpdate.id,
            title: fullUpdate.title,
            period: fullUpdate.period,
            body: fullUpdate.body,
            metrics: fullUpdate.metricValues.map((mv) => ({
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

    return NextResponse.json(fullUpdate, { status: 201 });
  } catch (err) {
    console.error("POST /api/companies/[id]/updates error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
