export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  if (!body.note?.trim()) {
    return NextResponse.json({ error: "A note describing your experience is required" }, { status: 400 });
  }

  const provider = await db.serviceProvider.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  if (provider.status === "REJECTED") {
    return NextResponse.json({ error: "Cannot endorse a rejected provider" }, { status: 400 });
  }

  const endorsement = await db.providerEndorsement.upsert({
    where: { providerId_userId: { providerId: id, userId: user!.id } },
    update: { note: body.note.trim() },
    create: { providerId: id, userId: user!.id, note: body.note.trim() },
    include: { user: { select: { id: true, name: true } } },
  });

  // First endorsement on a pending provider promotes it to vetted
  if (provider.status === "PENDING") {
    await db.serviceProvider.update({ where: { id }, data: { status: "VETTED" } });
  }

  return NextResponse.json(endorsement);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  await db.providerEndorsement.deleteMany({
    where: { providerId: id, userId: user!.id },
  });

  return NextResponse.json({ ok: true });
}
