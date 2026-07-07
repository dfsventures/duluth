export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.metricAlert.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    const body = await request.json();
    if (body.resolved !== true) {
      return NextResponse.json({ error: "Only { resolved: true } is supported" }, { status: 400 });
    }

    const alert = await db.metricAlert.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedById: user!.id },
    });

    await logAdminAction(user!, "ALERT_DISMISSED", {
      targetType: "MetricAlert",
      targetId: id,
      metadata: { rule: existing.rule, companyId: existing.companyId },
    });

    return NextResponse.json(alert);
  } catch (err) {
    console.error("PATCH /api/admin/alerts/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
