export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { indexUpdate } from "@/lib/ai";

export async function POST() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured — embeddings cannot be generated" },
        { status: 400 }
      );
    }

    const updates = await db.update.findMany({
      where: { status: "SENT" },
      select: { id: true },
    });

    let indexed = 0;
    let failed = 0;

    for (const update of updates) {
      try {
        await indexUpdate(update.id);
        indexed++;
      } catch (err) {
        console.error(`Failed to index update ${update.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({ indexed, failed, total: updates.length });
  } catch (err) {
    console.error("POST /api/admin/reindex error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
