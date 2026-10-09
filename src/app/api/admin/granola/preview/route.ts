export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";
import { granolaIntakeEnabled, NOTE_ID_RE } from "@/lib/granola";
import { previewGranolaNote, safeErrorText } from "@/lib/granola-intake";

// Dry run: reads the note, calls Claude once, writes nothing (no intake row either).
export async function POST(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;
    if (!granolaIntakeEnabled()) {
      return NextResponse.json({ error: "Granola intake is not configured" }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const noteId = typeof body?.noteId === "string" ? body.noteId.trim() : "";
    if (!NOTE_ID_RE.test(noteId)) {
      return NextResponse.json({ error: "Enter a Granola note id like not_1d3tmYTlCICgjy" }, { status: 400 });
    }

    let result;
    try {
      result = await previewGranolaNote(noteId);
    } catch (err) {
      console.error(`POST /api/admin/granola/preview failed: ${safeErrorText(err)}`);
      return NextResponse.json({ error: safeErrorText(err) }, { status: 502 });
    }
    await logAdminAction(user!, "GRANOLA_PREVIEW", { metadata: { noteId, outcome: result.outcome } });
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/admin/granola/preview error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
