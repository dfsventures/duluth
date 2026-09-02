export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Part 30, WS70.1 — manages a PortfolioCompany's PortfolioCompanyContact
// rows. Mirrors /api/admin/lps/[id]/emails/route.ts handler-for-handler,
// including its locally-declared EMAIL_REGEX (house convention — not
// centralized). Sits beside the existing …/[id]/marks sub-route under the
// hyphenated namespace (F61).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const company = await db.portfolioCompany.findUnique({ where: { id } });
    if (!company) return NextResponse.json({ error: "Portfolio company not found" }, { status: 404 });

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) || null : null;
    const role = typeof body.role === "string" ? body.role.trim().slice(0, 200) || null : null;

    // JC-BC-B: duplicate check scoped to THIS company only — the same
    // address can legitimately be a contact at another portfolio company.
    const clash = await db.portfolioCompanyContact.findUnique({
      where: { portfolioCompanyId_email: { portfolioCompanyId: id, email } },
    });
    if (clash) {
      return NextResponse.json({ error: "This company already has that contact." }, { status: 400 });
    }

    const created = await db.portfolioCompanyContact.create({
      data: { portfolioCompanyId: id, email, name, role },
    });

    await logAdminAction(user!, "PORTCO_CONTACT_ADDED", {
      targetType: "PortfolioCompany",
      targetId: id,
      metadata: { email },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/portfolio-companies/[id]/contacts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const contactId = typeof body.id === "string" ? body.id : "";
    if (!contactId) return NextResponse.json({ error: "id is required." }, { status: 400 });

    const existing = await db.portfolioCompanyContact.findUnique({ where: { id: contactId } });
    if (!existing || existing.portfolioCompanyId !== id) {
      return NextResponse.json({ error: "Contact not found for this company." }, { status: 404 });
    }

    const data: { name?: string | null; role?: string | null; email?: string } = {};

    if (body.name !== undefined) {
      data.name = typeof body.name === "string" ? body.name.trim().slice(0, 200) || null : null;
    }
    if (body.role !== undefined) {
      data.role = typeof body.role === "string" ? body.role.trim().slice(0, 200) || null : null;
    }
    if (body.email !== undefined) {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email || !EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
      }
      if (email !== existing.email) {
        const clash = await db.portfolioCompanyContact.findUnique({
          where: { portfolioCompanyId_email: { portfolioCompanyId: id, email } },
        });
        if (clash) {
          return NextResponse.json({ error: "This company already has that contact." }, { status: 400 });
        }
      }
      data.email = email;
    }

    const updated = await db.portfolioCompanyContact.update({ where: { id: contactId }, data });

    await logAdminAction(user!, "PORTCO_CONTACT_UPDATED", {
      targetType: "PortfolioCompany",
      targetId: id,
      metadata: { contactId, email: updated.email },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/admin/portfolio-companies/[id]/contacts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const contactId = typeof body.id === "string" ? body.id : "";
    if (!contactId) return NextResponse.json({ error: "id is required." }, { status: 400 });

    // Defense-in-depth against a cross-company id (the WS55/F48 shape).
    const existing = await db.portfolioCompanyContact.findUnique({ where: { id: contactId } });
    if (!existing || existing.portfolioCompanyId !== id) {
      return NextResponse.json({ error: "Contact not found for this company." }, { status: 404 });
    }

    await db.portfolioCompanyContact.delete({ where: { id: contactId } });

    await logAdminAction(user!, "PORTCO_CONTACT_REMOVED", {
      targetType: "PortfolioCompany",
      targetId: id,
      metadata: { email: existing.email },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/portfolio-companies/[id]/contacts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
