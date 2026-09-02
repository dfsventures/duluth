export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const pendingUsers = await db.user.findMany({
      where: { status: "PENDING", approvalToken: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        status: true,
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

    // Part 31, WS77 (F64) — the admin/approvals page has always rendered
    // approval.companyName, but this route never returned that key, so
    // the pending card never showed the company a founder typed. Mirrors
    // how the awaiting-setup section (further down the same page) already
    // derives it: memberships[0].company.name.
    const result = pendingUsers.map((u) => ({
      ...u,
      companyId: u.memberships[0]?.company?.id ?? null,
      companyName: u.memberships[0]?.company?.name ?? null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/admin/approvals error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
