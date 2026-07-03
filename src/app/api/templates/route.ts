export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";

export async function GET() {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    const templates = await db.updateTemplate.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, description: true, body: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(templates);
  } catch (err) {
    console.error("GET /api/templates error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
