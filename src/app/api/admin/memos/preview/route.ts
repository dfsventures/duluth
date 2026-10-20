export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { readObjectBody } from "@/lib/memo-route";
import { renderMemoMarkdown } from "@/lib/memo-render";
import { MEMO_ERRORS, MEMO_LIMITS } from "@/lib/memos";

// The editor's Preview tab: markdown in, sanitized HTML out (the client bundle carries no markdown library).
export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body || typeof body.markdown !== "string") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    if (body.markdown.length > MEMO_LIMITS.sectionChars) return NextResponse.json({ error: MEMO_ERRORS.sectionTooLong }, { status: 400 });
    return NextResponse.json({ html: renderMemoMarkdown(body.markdown, { surface: "app" }) });
  } catch (err) {
    console.error("POST /api/admin/memos/preview error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
