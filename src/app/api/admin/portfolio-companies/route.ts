export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const q = searchParams.get("q");

    const companies = await db.portfolioCompany.findMany({
      where: {
        ...(fundId ? { deals: { some: { fundId } } } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { deals: true, mentions: true, contacts: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(
      companies.map((c) => ({
        id: c.id,
        name: c.name,
        country: c.country,
        companyId: c.companyId,
        company: c.company,
        dealCount: c._count.deals,
        mentionCount: c._count.mentions,
        contactCount: c._count.contacts,
      }))
    );
  } catch (err) {
    console.error("GET /api/admin/portfolio-companies error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const name = body.name?.trim();
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "Name is required and must be 200 characters or fewer." }, { status: 400 });
    }

    const existing = await db.portfolioCompany.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json({ error: "A portfolio company with this name already exists." }, { status: 400 });
    }

    const portfolioCompany = await db.portfolioCompany.create({
      data: {
        name,
        country: body.country?.trim() || null,
        companyId: body.companyId || null,
      },
    });

    await logAdminAction(user!, "PORTCO_CREATED", { targetType: "PortfolioCompany", targetId: portfolioCompany.id, metadata: { name } });
    return NextResponse.json(portfolioCompany, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/portfolio-companies error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
