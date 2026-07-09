export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Same pattern as api/auth/signup and api/share/[token]/view — duplicated
// intentionally rather than centralized (house convention).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const lps = await db.limitedPartner.findMany({
      include: { funds: { include: { fund: { select: { id: true, name: true, slug: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      lps.map((lp) => ({
        id: lp.id,
        email: lp.email,
        name: lp.name,
        createdAt: lp.createdAt,
        funds: lp.funds.map((m) => ({ id: m.fund.id, name: m.fund.name, slug: m.fund.slug })),
      }))
    );
  } catch (err) {
    console.error("GET /api/admin/lps error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const email = body.email?.trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    const existing = await db.limitedPartner.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An LP with this email already exists." }, { status: 400 });
    }

    const fundIds: string[] = Array.isArray(body.fundIds) ? body.fundIds : [];

    const lp = await db.limitedPartner.create({
      data: {
        email,
        name: body.name?.trim() || null,
        funds: fundIds.length > 0 ? { create: fundIds.map((fundId: string) => ({ fundId })) } : undefined,
      },
      include: { funds: { include: { fund: { select: { id: true, name: true, slug: true } } } } },
    });

    await logAdminAction(user!, "LP_CREATED", { targetType: "LimitedPartner", targetId: lp.id, metadata: { email } });
    return NextResponse.json(
      { id: lp.id, email: lp.email, name: lp.name, createdAt: lp.createdAt, funds: lp.funds.map((m) => ({ id: m.fund.id, name: m.fund.name, slug: m.fund.slug })) },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/admin/lps error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
