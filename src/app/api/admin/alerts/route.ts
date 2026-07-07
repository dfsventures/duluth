export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const alerts = await db.metricAlert.findMany({
      where: { resolvedAt: null },
      orderBy: { firedAt: "desc" },
      take: 100,
      include: {
        company: { select: { id: true, name: true } },
        metricDefinition: { select: { name: true, unit: true } },
      },
    });

    return NextResponse.json(alerts);
  } catch (err) {
    console.error("GET /api/admin/alerts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
