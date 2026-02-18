export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const definitions = await db.metricDefinition.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(definitions);
  } catch (err) {
    console.error("GET /api/companies/[id]/metrics error:", err);
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
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const body = await request.json();
    const { name, unit } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Metric name is required" },
        { status: 400 }
      );
    }

    // Check for duplicate metric name within company
    const existing = await db.metricDefinition.findUnique({
      where: {
        companyId_name: {
          companyId: id,
          name: name.trim(),
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A metric with this name already exists for this company" },
        { status: 409 }
      );
    }

    const definition = await db.metricDefinition.create({
      data: {
        companyId: id,
        name: name.trim(),
        unit: unit || null,
      },
    });

    return NextResponse.json(definition, { status: 201 });
  } catch (err) {
    console.error("POST /api/companies/[id]/metrics error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
