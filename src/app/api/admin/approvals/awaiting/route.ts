export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

/**
 * Users who are approved-but-never-set-a-password (or an admin-approved
 * signup founder still PENDING with a live token — F19's population).
 * Kept as a sibling endpoint rather than reshaping GET /api/admin/approvals
 * (whose client reads `data.data ?? data`) — additive beats clever here.
 * Prisma mirror of canResendSetupLink() in src/lib/setup-token.ts.
 */
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const awaitingUsers = await db.user.findMany({
      where: {
        passwordHash: null,
        status: { not: "REJECTED" },
        OR: [{ status: "APPROVED" }, { approvalToken: { not: null } }],
      },
      orderBy: { tokenExpiresAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        tokenExpiresAt: true,
        createdAt: true,
        memberships: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(awaitingUsers);
  } catch (err) {
    console.error("GET /api/admin/approvals/awaiting error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
