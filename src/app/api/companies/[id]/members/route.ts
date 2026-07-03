export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, requireCompanyAccess } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

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
          select: { id: true, name: true, email: true, roles: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const members = memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      userRoles: m.user.roles,
      membershipRole: m.role,
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
    const { user: actor, error } = await requireAdmin();
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
    const membership = await db.userCompanyMembership.upsert({
      where: { userId_companyId: { userId: user.id, companyId: id } },
      update: {},
      create: { userId: user.id, companyId: id },
    });

    await logAdminAction(actor!, "MEMBER_ADDED", { targetType: "Company", targetId: id, metadata: { email: user.email } });
    return NextResponse.json({
      membershipId: membership.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      userRoles: user.roles,
      membershipRole: membership.role,
    });
  } catch (err) {
    console.error("POST /api/companies/[id]/members error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    // Check caller is admin or OWNER of this company
    let callerIsAdmin = user.roles.includes("ADMIN");
    if (!callerIsAdmin) {
      const callerMembership = await db.userCompanyMembership.findUnique({
        where: { userId_companyId: { userId: user.id, companyId: id } },
      });
      if (callerMembership?.role !== "OWNER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await request.json();
    const { userId, role } = body;
    if (!userId || !role) {
      return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }

    const allowedRoles = callerIsAdmin
      ? ["OWNER", "MEMBER", "VIEWER"]
      : ["MEMBER", "VIEWER"];

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${allowedRoles.join(", ")}` },
        { status: 400 }
      );
    }

    const membership = await db.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId, companyId: id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const updated = await db.userCompanyMembership.update({
      where: { userId_companyId: { userId, companyId: id } },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true, roles: true } } },
    });

    return NextResponse.json({
      membershipId: updated.id,
      userId: updated.user.id,
      name: updated.user.name,
      email: updated.user.email,
      userRoles: updated.user.roles,
      membershipRole: updated.role,
    });
  } catch (err) {
    console.error("PATCH /api/companies/[id]/members error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    // Admins can remove anyone; founders must be OWNER of this company
    if (!user.roles.includes("ADMIN")) {
      const callerMembership = await db.userCompanyMembership.findUnique({
        where: { userId_companyId: { userId: user.id, companyId: id } },
      });
      if (callerMembership?.role !== "OWNER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await request.json();
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const targetMembership = await db.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId, companyId: id } },
    });
    if (!targetMembership) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent removing the last OWNER
    if (targetMembership.role === "OWNER") {
      const ownerCount = await db.userCompanyMembership.count({
        where: { companyId: id, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the only owner" },
          { status: 400 }
        );
      }
    }

    await db.userCompanyMembership.delete({
      where: { userId_companyId: { userId, companyId: id } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/companies/[id]/members error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
