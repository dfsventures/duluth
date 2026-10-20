export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { saveTemplate } from "@/lib/memo-actions";
import { currentTemplate } from "@/lib/memo-template";
import { memoResponse, readObjectBody } from "@/lib/memo-route";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    return NextResponse.json(await currentTemplate());
  } catch (err) {
    console.error("GET /api/admin/memos/template error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// { sections: [...] } saves a NEW version. Memos already created keep their sections.
export async function PUT(request: Request) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = await readObjectBody(request);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    return memoResponse(await saveTemplate(user!, body.sections), 201);
  } catch (err) {
    console.error("PUT /api/admin/memos/template error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
