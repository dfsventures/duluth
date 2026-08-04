export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { canHardDeleteFromQueue } from "@/lib/setup-token";

/**
 * Guarded hard delete for the awaiting-setup queue (WS48/F41). Only safe
 * when the target is not a company creator and not an admin — see
 * canHardDeleteFromQueue(). The 409 message is defense-in-depth: the UI
 * already hides/disables the button in the blocked case, but this endpoint
 * must refuse safely even if called directly.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, error } = await requireAdmin();
    if (error) return error;
    const { id } = await params;

    const target = await db.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: { company: { select: { id: true, name: true, createdById: true } } },
        },
      },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const ownedCompanies = target.memberships
      .map((m) => m.company)
      .filter((c) => c.createdById === id);

    if (!canHardDeleteFromQueue(target, ownedCompanies.length)) {
      const reason = target.passwordHash
        ? "This account has already completed setup."
        : target.roles.includes("ADMIN")
          ? "Admin accounts can't be deleted from this queue."
          : `This account created ${ownedCompanies.map((c) => c.name).join(", ")} — deleting it here would either fail or require deleting that company too, which this action doesn't do. Use "Dismiss" instead, or delete the company from Admin → Companies if you want to remove it entirely.`;
      return NextResponse.json({ error: reason }, { status: 409 });
    }

    await db.user.delete({ where: { id } }); // memberships cascade — prisma/schema.prisma:144-145

    await logAdminAction(actor!, "SETUP_QUEUE_USER_DELETED", {
      targetType: "User",
      targetId: id,
      metadata: { email: target.email, companyNames: target.memberships.map((m) => m.company.name) },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/approvals/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
