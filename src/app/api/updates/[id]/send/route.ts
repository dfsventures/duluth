import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.update.findUnique({
      where: { id },
      select: { companyId: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const { error } = await requireCompanyAccess(existing.companyId);
    if (error) return error;

    if (existing.status === "SENT") {
      return NextResponse.json(
        { error: "Update has already been sent" },
        { status: 400 }
      );
    }

    const updated = await db.update.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("POST /api/updates/[id]/send error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
