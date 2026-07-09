export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

function serializeFund(f: {
  id: string;
  slug: string;
  name: string;
  groupLabel: string | null;
  firstDealDate: Date | null;
  aumUsd: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: { deals: number; lps: number; reports: number };
}) {
  return {
    id: f.id,
    slug: f.slug,
    name: f.name,
    groupLabel: f.groupLabel,
    firstDealDate: f.firstDealDate,
    aumUsd: f.aumUsd !== null ? Number(f.aumUsd) : null,
    sortOrder: f.sortOrder,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    dealCount: f._count?.deals ?? 0,
    lpCount: f._count?.lps ?? 0,
    reportCount: f._count?.reports ?? 0,
  };
}

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const funds = await db.fund.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { deals: true, lps: true, reports: true } } },
    });

    return NextResponse.json(funds.map(serializeFund));
  } catch (err) {
    console.error("GET /api/admin/funds error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const slug = body.slug?.trim();
    const name = body.name?.trim();

    if (!slug || slug.length > 40) {
      return NextResponse.json({ error: "Slug is required and must be 40 characters or fewer." }, { status: 400 });
    }
    if (!name || name.length > 120) {
      return NextResponse.json({ error: "Name is required and must be 120 characters or fewer." }, { status: 400 });
    }

    const existing = await db.fund.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: "A fund with this slug already exists." }, { status: 400 });
    }

    const fund = await db.fund.create({
      data: {
        slug,
        name,
        groupLabel: body.groupLabel?.trim() || null,
        firstDealDate: body.firstDealDate ? new Date(body.firstDealDate) : null,
        aumUsd: body.aumUsd !== undefined && body.aumUsd !== null && body.aumUsd !== "" ? Number(body.aumUsd) : null,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      },
    });

    await logAdminAction(user!, "FUND_CREATED", { targetType: "Fund", targetId: fund.id, metadata: { slug, name } });
    return NextResponse.json(serializeFund({ ...fund, _count: { deals: 0, lps: 0, reports: 0 } }), { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/funds error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
