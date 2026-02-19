export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, requireCompanyAccess } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const memberships = await db.userCompanyMembership.findMany({
      where: { companyId: id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const members = memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.user.role,
    }));

    return NextResponse.json(members);
  } catch (err) {
    console.error("GET /api/companies/[id]/members error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const company = await db.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: `No user found with email: ${email}` },
        { status: 404 }
      );
    }

    if (user.status !== "APPROVED") {
      return NextResponse.json(
        { error: "User account is not yet approved" },
        { status: 400 }
      );
    }

    // Upsert — no-op if already a member
    await db.userCompanyMembership.upsert({
      where: { userId_companyId: { userId: user.id, companyId: id } },
      update: {},
      create: { userId: user.id, companyId: id },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    console.error("POST /api/companies/[id]/members error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const userId = body.userId;
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    await db.userCompanyMembership.deleteMany({
      where: { userId, companyId: id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/companies/[id]/members error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
