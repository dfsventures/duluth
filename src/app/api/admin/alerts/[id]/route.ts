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
    if (body.resolved !== true && body.resolved !== false) {
      return NextResponse.json({ error: "Expected { resolved: true } or { resolved: false }" }, { status: 400 });
    }

    // { resolved: false } is the Undo for a dismiss (UI overhaul phase 7). It only
    // clears the dismissal; the dedupeKey is unchanged, so the evaluator still
    // will not fire a duplicate.
    const restoring = body.resolved === false;
    const alert = await db.metricAlert.update({
      where: { id },
      data: restoring ? { resolvedAt: null, resolvedById: null } : { resolvedAt: new Date(), resolvedById: user!.id },
    });

    await logAdminAction(user!, restoring ? "ALERT_RESTORED" : "ALERT_DISMISSED", {
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
