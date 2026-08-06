export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Part 26 (WS60): manages an LP's LpEmail rows. Mirrors the /funds
// sub-route shape (requireAdmin, load LP, mutate, audit). Same
// duplicated-EMAIL_REGEX convention as api/admin/lps/route.ts and
// api/admin/lps/[id]/route.ts (house convention — not centralized).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const lp = await db.limitedPartner.findUnique({ where: { id } });
    if (!lp) return NextResponse.json({ error: "LP not found" }, { status: 404 });

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    // D1: global uniqueness now lives on LpEmail, not LimitedPartner.email —
    // this catches a clash against ANOTHER LP's secondary address too, which
    // the old LimitedPartner.email-only check missed.
    const clash = await db.lpEmail.findUnique({ where: { email } });
    if (clash) {
      return NextResponse.json({ error: "Another LP already uses this email." }, { status: 400 });
    }

    const requestedPrimary = body.isPrimary === true;

    const created = await db.$transaction(async (tx) => {
      const existingCount = await tx.lpEmail.count({ where: { lpId: id } });
      // First address for this LP is always primary, regardless of the flag.
      const makePrimary = existingCount === 0 || requestedPrimary;

      const row = await tx.lpEmail.create({ data: { lpId: id, email, isPrimary: makePrimary } });

      if (makePrimary) {
        await tx.lpEmail.updateMany({ where: { lpId: id, id: { not: row.id } }, data: { isPrimary: false } });
        await tx.limitedPartner.update({ where: { id }, data: { email } }); // JC1: keep the mirror synced
      }

      return row;
    });

    await logAdminAction(user!, "LP_EMAIL_ADDED", {
      targetType: "LimitedPartner",
      targetId: id,
      metadata: { email, isPrimary: created.isPrimary },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/lps/[id]/emails error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const lp = await db.limitedPartner.findUnique({ where: { id } });
    if (!lp) return NextResponse.json({ error: "LP not found" }, { status: 404 });

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });

    const target = await db.lpEmail.findUnique({ where: { email } });
    if (!target || target.lpId !== id) {
      return NextResponse.json({ error: "Address not found for this LP." }, { status: 404 });
    }

    // D3: removing an address only revokes sessions if it drops the LP to
    // ZERO addresses — not on every removal (that was the old any-edit
    // behavior on PATCH /api/admin/lps/[id], now removed at its source).
    const result = await db.$transaction(async (tx) => {
      await tx.lpEmail.delete({ where: { id: target.id } });
      const remaining = await tx.lpEmail.findMany({ where: { lpId: id }, orderBy: { createdAt: "asc" } });

      let sessionsRevoked = false;
      if (remaining.length === 0) {
        await tx.limitedPartner.update({ where: { id }, data: { email: null } }); // JC2: null mirror
        await tx.lpSession.deleteMany({ where: { lpId: id } }); // ONLY here — count hit zero
        sessionsRevoked = true;
      } else if (target.isPrimary) {
        const next = remaining[0]; // oldest remaining, deterministic
        await tx.lpEmail.update({ where: { id: next.id }, data: { isPrimary: true } });
        await tx.limitedPartner.update({ where: { id }, data: { email: next.email } });
      }

      return { sessionsRevoked };
    });

    await logAdminAction(user!, "LP_EMAIL_REMOVED", {
      targetType: "LimitedPartner",
      targetId: id,
      metadata: { email, sessionsRevoked: result.sessionsRevoked },
    });
    return NextResponse.json({ ok: true, sessionsRevoked: result.sessionsRevoked });
  } catch (err) {
    console.error("DELETE /api/admin/lps/[id]/emails error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const lp = await db.limitedPartner.findUnique({ where: { id } });
    if (!lp) return NextResponse.json({ error: "LP not found" }, { status: 404 });

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });

    const target = await db.lpEmail.findUnique({ where: { email } });
    if (!target || target.lpId !== id) {
      return NextResponse.json({ error: "Address not found for this LP." }, { status: 404 });
    }

    // Set-primary does not touch sessions — it is not a removal.
    await db.$transaction(async (tx) => {
      await tx.lpEmail.updateMany({ where: { lpId: id, id: { not: target.id } }, data: { isPrimary: false } });
      await tx.lpEmail.update({ where: { id: target.id }, data: { isPrimary: true } });
      await tx.limitedPartner.update({ where: { id }, data: { email } }); // JC1: keep the mirror synced
    });

    await logAdminAction(user!, "LP_EMAIL_PRIMARY_CHANGED", {
      targetType: "LimitedPartner",
      targetId: id,
      metadata: { email },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/admin/lps/[id]/emails error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
