export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";

export async function GET(request: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId") || undefined;
  const country = searchParams.get("country") || undefined;
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;

  const providers = await db.serviceProvider.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      ...(country ? { country: { contains: country, mode: "insensitive" } } : {}),
      ...(status === "ALL" ? {} : status ? { status: status as "PENDING" | "VETTED" | "REJECTED" } : { status: { not: "REJECTED" as const } }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { country: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      category: { select: { id: true, name: true } },
      endorsements: {
        select: {
          id: true,
          userId: true,
          note: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      submittedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  // Attach current user's endorsement flag for the UI
  const result = providers.map((p) => ({
    ...p,
    userEndorsement: p.endorsements.find((e) => e.userId === user!.id) ?? null,
    endorsementCount: p.endorsements.length,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { type, name, website, linkedin, categoryId, description, contactEmail, country, city, endorsementNote } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!categoryId) return NextResponse.json({ error: "Category is required" }, { status: 400 });
  if (!endorsementNote?.trim()) return NextResponse.json({ error: "Your experience note is required" }, { status: 400 });

  const category = await db.serviceCategory.findUnique({ where: { id: categoryId } });
  if (!category) return NextResponse.json({ error: "Invalid category" }, { status: 400 });

  const provider = await db.serviceProvider.create({
    data: {
      type: type === "INDIVIDUAL" ? "INDIVIDUAL" : "FIRM",
      name: name.trim(),
      website: website?.trim() || null,
      linkedin: linkedin?.trim() || null,
      categoryId,
      description: description?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      country: country?.trim() || null,
      city: city?.trim() || null,
      status: "PENDING",
      submittedById: user!.id,
    },
  });

  // Auto-endorse from the submitter — a testimonial, not a status change
  await db.providerEndorsement.create({
    data: { providerId: provider.id, userId: user!.id, note: endorsementNote.trim() },
  });

  const full = await db.serviceProvider.findUnique({
    where: { id: provider.id },
    include: {
      category: { select: { id: true, name: true } },
      endorsements: {
        select: { id: true, userId: true, note: true, createdAt: true, user: { select: { id: true, name: true } } },
      },
      submittedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(full, { status: 201 });
}
