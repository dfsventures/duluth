export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { id, noteId } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;

    const note = await db.companyNote.findUnique({ where: { id: noteId } });
    if (!note || note.companyId !== id) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, body: noteBody, occurredAt, transcriptUrl } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!noteBody?.trim()) {
      return NextResponse.json({ error: "Body is required" }, { status: 400 });
    }
    if (!occurredAt) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    const updated = await db.companyNote.update({
      where: { id: noteId },
      data: {
        title: title.trim(),
        body: noteBody,
        occurredAt: new Date(occurredAt),
        transcriptUrl: transcriptUrl?.trim() || null,
        revisions: {
          create: {
            title: title.trim(),
            body: noteBody,
            occurredAt: new Date(occurredAt),
            transcriptUrl: transcriptUrl?.trim() || null,
            editedById: user!.id,
          },
        },
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { editedBy: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { revisions: true } },
      },
    });

    // Re-index for AI (fire-and-forget)
    import("@/lib/ai").then(({ indexNote }) => indexNote(noteId)).catch(console.error);

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/companies/[id]/notes/[noteId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
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

    await db.companyNote.delete({ where: { id: noteId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/companies/[id]/notes/[noteId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
