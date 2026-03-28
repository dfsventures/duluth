export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { id, noteId } = await params;
    const { error } = await requireAdmin();
    if (error) return error;

    const note = await db.companyNote.findUnique({ where: { id: noteId } });
    if (!note || note.companyId !== id) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const revisions = await db.companyNoteRevision.findMany({
      where: { noteId },
      include: { editedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(revisions);
  } catch (err) {
    console.error("GET /api/companies/[id]/notes/[noteId]/revisions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
