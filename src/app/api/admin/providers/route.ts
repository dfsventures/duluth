export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!body.categoryId) return NextResponse.json({ error: "Category is required" }, { status: 400 });

    const category = await db.serviceCategory.findUnique({ where: { id: body.categoryId } });
    if (!category) return NextResponse.json({ error: "Invalid category" }, { status: 400 });

    // schema has @@unique([name, categoryId]) — check first so the user gets a 409, not a 500
    const existing = await db.serviceProvider.findUnique({
      where: { name_categoryId: { name: body.name.trim(), categoryId: body.categoryId } },
    });
    if (existing) return NextResponse.json({ error: "A provider with that name already exists in this category" }, { status: 409 });

    const validStatuses = ["PENDING", "VETTED", "REJECTED"] as const;
    const status = validStatuses.includes(body.status) ? body.status : "VETTED";

    const provider = await db.serviceProvider.create({
      data: {
        type: body.type === "INDIVIDUAL" ? "INDIVIDUAL" : "FIRM",
        name: body.name.trim(),
        website: body.website?.trim() || null,
        linkedin: body.linkedin?.trim() || null,
        categoryId: body.categoryId,
        description: body.description?.trim() || null,
        contactEmail: body.contactEmail?.trim() || null,
        country: body.country?.trim() || null,
        city: body.city?.trim() || null,
        status,                       // D2: defaults to VETTED for admin-created entries
        submittedById: user!.id,      // provenance: "Submitted by <admin name>" renders honestly
      },
      include: {
        category: { select: { id: true, name: true } },
        endorsements: { select: { id: true, userId: true, note: true, createdAt: true, user: { select: { id: true, name: true } } } },
      },
    });

    await logAdminAction(user!, "PROVIDER_CREATED", { targetType: "ServiceProvider", targetId: provider.id, metadata: { name: provider.name, status } });
    return NextResponse.json(provider, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/providers error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
