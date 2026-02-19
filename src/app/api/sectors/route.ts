export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";

const DEFAULT_SECTORS = [
  "Fintech",
  "Agritech",
  "Healthtech",
  "Logistics",
  "Education",
  "E-commerce",
  "Other",
];

export async function GET() {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    let sectors = await db.sector.findMany({ orderBy: { name: "asc" } });

    // Seed defaults on first load
    if (sectors.length === 0) {
      await db.sector.createMany({
        data: DEFAULT_SECTORS.map((name) => ({ name })),
        skipDuplicates: true,
      });
      sectors = await db.sector.findMany({ orderBy: { name: "asc" } });
    }

    return NextResponse.json(sectors);
  } catch (err) {
    console.error("GET /api/sectors error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    const body = await request.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const existing = await db.sector.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      return NextResponse.json(existing); // Return existing rather than error
    }

    const sector = await db.sector.create({ data: { name } });
    return NextResponse.json(sector, { status: 201 });
  } catch (err) {
    console.error("POST /api/sectors error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
