export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { id, metricId } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const definition = await db.metricDefinition.findUnique({
      where: { id: metricId },
    });

    if (!definition || definition.companyId !== id) {
      return NextResponse.json(
        { error: "Metric definition not found" },
        { status: 404 }
      );
    }

    await db.metricDefinition.delete({ where: { id: metricId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/companies/[id]/metrics/definitions/[metricId] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
