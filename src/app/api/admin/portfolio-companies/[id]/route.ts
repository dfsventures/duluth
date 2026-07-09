export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.portfolioCompany.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Portfolio company not found" }, { status: 404 });

    const body = await request.json();
    const data: { name?: string; country?: string | null; companyId?: string | null } = {};

    if (body.name !== undefined) {
      const name = body.name?.trim();
      if (!name || name.length > 200) {
        return NextResponse.json({ error: "Name is required and must be 200 characters or fewer." }, { status: 400 });
      }
      data.name = name;
    }
    if (body.country !== undefined) data.country = body.country?.trim() || null;
    if (body.companyId !== undefined) data.companyId = body.companyId || null;

    const portfolioCompany = await db.portfolioCompany.update({ where: { id }, data });

    await logAdminAction(user!, "PORTCO_UPDATED", { targetType: "PortfolioCompany", targetId: id, metadata: data });
    return NextResponse.json(portfolioCompany);
  } catch (err) {
    console.error("PATCH /api/admin/portfolio-companies/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.portfolioCompany.findUnique({
      where: { id },
      include: { _count: { select: { deals: true, mentions: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Portfolio company not found" }, { status: 404 });

    if (existing._count.deals > 0 || existing._count.mentions > 0) {
      return NextResponse.json(
        { error: "This portfolio company still has deals or report mentions attached — remove those first." },
        { status: 409 }
      );
    }

    await db.portfolioCompany.delete({ where: { id } });

    await logAdminAction(user!, "PORTCO_DELETED", { targetType: "PortfolioCompany", targetId: id, metadata: { name: existing.name } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/portfolio-companies/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
