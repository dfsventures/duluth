export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const templates = await db.updateTemplate.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json(templates);
  } catch (err) {
    console.error("GET /api/admin/templates error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const name = body.name?.trim();
    const templateBody = body.body?.trim();
    const description = body.description?.trim();

    if (!name || name.length > 120) {
      return NextResponse.json(
        { error: "Name is required and must be 120 characters or fewer." },
        { status: 400 }
      );
    }
    if (!templateBody) {
      return NextResponse.json({ error: "Template content is required." }, { status: 400 });
    }

    const template = await db.updateTemplate.create({
      data: {
        name,
        description: description || null,
        body: templateBody,
        createdById: user!.id,
      },
    });

    await logAdminAction(user!, "TEMPLATE_CREATED", { targetType: "UpdateTemplate", targetId: template.id, metadata: { name } });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/templates error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
