export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Part 16, WS41.3 (Q54, JC-DD-E) — explicit admin promotion. Writes only
// Company.stage/CompanyDiligence.closedAt — deliberately never touches
// Fund/Deal/PortfolioCompany, which stay a separate, later, manual step
// through the existing Deal Ledger admin CRUD.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;

    const company = await db.company.findUnique({
      where: { id },
      include: {
        diligence: true,
        memberships: {
          where: { role: "OWNER" },
          take: 1,
          include: { user: { select: { email: true } } },
        },
      },
    });

    if (!company || company.stage !== "DILIGENCE" || !company.diligence) {
      return NextResponse.json({ error: "Company is not awaiting due diligence" }, { status: 404 });
    }

    await db.$transaction([
      db.company.update({ where: { id }, data: { stage: "ACTIVE" } }),
      db.companyDiligence.update({ where: { companyId: id }, data: { closedAt: new Date() } }),
    ]);

    await logAdminAction(actor!, "COMPANY_DILIGENCE_PROMOTED", {
      targetType: "Company",
      targetId: id,
      metadata: {
        companyName: company.name,
        founderEmail: company.memberships[0]?.user.email ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/admin/diligence/[id]/promote error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
