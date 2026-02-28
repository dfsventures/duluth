export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const updates = await db.update.findMany({
      where: { status: "SENT" },
      select: {
        id: true,
        title: true,
        period: true,
        sentAt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { sentAt: "desc" },
    });

    return NextResponse.json(updates);
  } catch (err) {
    console.error("GET /api/admin/updates error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
