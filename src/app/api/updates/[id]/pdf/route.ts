export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { generateUpdateHTML } from "@/lib/pdf";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    const update = await db.update.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!update) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const html = await generateUpdateHTML(id);
    if (!html) {
      return NextResponse.json({ error: "Failed to generate" }, { status: 500 });
    }

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("GET /api/updates/[id]/pdf error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
