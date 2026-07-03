export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const existing = await db.serviceCategory.findUnique({ where: { name: body.name.trim() } });
  if (existing) return NextResponse.json({ error: "Category already exists" }, { status: 409 });

  const category = await db.serviceCategory.create({ data: { name: body.name.trim() } });
  await logAdminAction(user!, "PROVIDER_CATEGORY_CREATED", { targetType: "ServiceCategory", targetId: category.id, metadata: { name: category.name } });
  return NextResponse.json(category, { status: 201 });
}
