import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { id, metricId } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    // Verify the metric definition belongs to this company
    const definition = await db.metricDefinition.findUnique({
      where: { id: metricId },
    });

    if (!definition || definition.companyId !== id) {
      return NextResponse.json(
        { error: "Metric definition not found for this company" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { value, date } = body;

    if (value === undefined || value === null) {
      return NextResponse.json(
        { error: "Value is required" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: "Date is required" },
        { status: 400 }
      );
    }

    const metricValue = await db.metricValue.create({
      data: {
        metricDefinitionId: metricId,
        value,
        date: new Date(date),
      },
      include: {
        metricDefinition: true,
      },
    });

    return NextResponse.json(metricValue, { status: 201 });
  } catch (err) {
    console.error(
      "POST /api/companies/[id]/metrics/definitions/[metricId]/values error:",
      err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
