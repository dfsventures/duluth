export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const provider = await db.serviceProvider.findUnique({
    where: { id },
    include: {
      category: true,
      endorsements: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      submittedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(provider);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const provider = await db.serviceProvider.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.serviceProvider.update({
    where: { id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.website !== undefined ? { website: body.website || null } : {}),
      ...(body.linkedin !== undefined ? { linkedin: body.linkedin || null } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail || null } : {}),
      ...(body.country !== undefined ? { country: body.country || null } : {}),
      ...(body.city !== undefined ? { city: body.city || null } : {}),
    },
    include: {
      category: { select: { id: true, name: true } },
      endorsements: {
        select: { id: true, userId: true, note: true, createdAt: true, user: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  await db.serviceProvider.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
