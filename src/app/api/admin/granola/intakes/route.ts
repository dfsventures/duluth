export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { granolaIntakeEnabled } from "@/lib/granola";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const intakes = await db.granolaIntake.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        noteId: true,
        status: true,
        trigger: true,
        noteTitle: true,
        attempts: true,
        digestId: true,
        cardsCreated: true,
        cardsLinked: true,
        skipReason: true,
        error: true,
        createdAt: true,
        finishedAt: true,
      },
    });
    return NextResponse.json({ enabled: granolaIntakeEnabled(), intakes });
  } catch (err) {
    console.error("GET /api/admin/granola/intakes error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
