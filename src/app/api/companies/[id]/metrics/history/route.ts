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
      include: {
        values: {
          orderBy: { date: "desc" },
        },
      },
    });

    return NextResponse.json(definitions);
  } catch (err) {
    console.error("GET /api/companies/[id]/metrics/history error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
