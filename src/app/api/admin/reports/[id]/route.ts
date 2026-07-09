export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const report = await db.fundReport.findUnique({
      where: { id },
      include: { fund: { select: { id: true, name: true, slug: true } } },
    });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    return NextResponse.json(report);
  } catch (err) {
    console.error("GET /api/admin/reports/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.fundReport.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // Q13 (unpublish-to-edit): published reports are read-only prose+numbers.
    if (existing.status === "PUBLISHED") {
      return NextResponse.json({ error: "Unpublish first to make changes." }, { status: 400 });
    }

    const body = await request.json();
    const data: { title?: string; periodLabel?: string | null; body?: string } = {};

    if (body.title !== undefined) {
      const title = body.title?.trim();
      if (!title || title.length > 200) {
        return NextResponse.json({ error: "Title is required and must be 200 characters or fewer." }, { status: 400 });
      }
      data.title = title;
    }
    if (body.periodLabel !== undefined) data.periodLabel = body.periodLabel?.trim() || null;
    if (body.body !== undefined) data.body = body.body;
    // fundId is immutable after creation — not accepted here.

    const report = await db.fundReport.update({ where: { id }, data });

    await logAdminAction(user!, "REPORT_UPDATED", { targetType: "FundReport", targetId: id });
    return NextResponse.json(report);
  } catch (err) {
    console.error("PATCH /api/admin/reports/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.fundReport.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    if (existing.status === "PUBLISHED") {
      return NextResponse.json({ error: "Unpublish before deleting a published report." }, { status: 409 });
    }

    await db.fundReport.delete({ where: { id } });

    await logAdminAction(user!, "REPORT_DELETED", { targetType: "FundReport", targetId: id, metadata: { title: existing.title } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/reports/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
