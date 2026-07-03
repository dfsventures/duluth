export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.updateTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: {
      name?: string;
      description?: string | null;
      body?: string;
      archivedAt?: Date | null;
    } = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 120) {
        return NextResponse.json(
          { error: "Name is required and must be 120 characters or fewer." },
          { status: 400 }
        );
      }
      data.name = name;
    }
    if (body.description !== undefined) {
      data.description = body.description?.trim() || null;
    }
    if (body.body !== undefined) {
      const templateBody = body.body.trim();
      if (!templateBody) {
        return NextResponse.json({ error: "Template content is required." }, { status: 400 });
      }
      data.body = templateBody;
    }
    if (body.archived !== undefined) {
      data.archivedAt = body.archived ? new Date() : null;
    }

    const template = await db.updateTemplate.update({ where: { id }, data });

    const action = body.archived === true ? "TEMPLATE_ARCHIVED" : body.archived === false ? "TEMPLATE_UNARCHIVED" : "TEMPLATE_UPDATED";
    await logAdminAction(user!, action, { targetType: "UpdateTemplate", targetId: id });
    return NextResponse.json(template);
  } catch (err) {
    console.error("PATCH /api/admin/templates/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const existing = await db.updateTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const template = await db.updateTemplate.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await logAdminAction(user!, "TEMPLATE_ARCHIVED", { targetType: "UpdateTemplate", targetId: id });
    return NextResponse.json(template);
  } catch (err) {
    console.error("DELETE /api/admin/templates/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
