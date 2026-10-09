export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { granolaIntakeEnabled } from "@/lib/granola";
import { processGranolaIntake } from "@/lib/granola-intake";

// Re-runs an intake. Safe on any finished row: cards are keyed (sourceKey) and the draft by
// granolaNoteId, and cards a human has touched are never overwritten.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;
    if (!granolaIntakeEnabled()) {
      return NextResponse.json({ error: "Granola intake is not configured" }, { status: 409 });
    }

    const stale = new Date(Date.now() - 15 * 60_000);
    const { count } = await db.granolaIntake.updateMany({
      where: {
        id: params.id,
        OR: [{ status: { not: "PROCESSING" } }, { lockedAt: { lt: stale } }],
      },
      data: { status: "PENDING", attempts: 0, error: null, skipReason: null, lockedAt: null },
    });
    if (count !== 1) {
      return NextResponse.json({ error: "Intake not found or still processing" }, { status: 409 });
    }

    const result = await processGranolaIntake(params.id, { manual: true });
    await logAdminAction(user!, "GRANOLA_INTAKE_RETRIED", {
      targetType: "GranolaIntake",
      targetId: params.id,
      metadata: { outcome: result.outcome },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/admin/granola/intakes/[id]/retry error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
