export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { createShareLink, listShareLinks } from "@/lib/memo-actions";
import { memoResponse, readObjectBody } from "@/lib/memo-route";

// The memo owner's share links. The list never carries a token or its hash.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    return memoResponse(await listShareLinks(user!, id));
  } catch (err) {
    console.error("GET /api/admin/memos/[id]/links error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// { label?, expiresAt? } -> { id, url, ... }. The URL is returned this once; only its fingerprint is stored.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error } = await requireAdmin();
    if (error) return error;
    const body = (await readObjectBody(request)) ?? {};
    const res = await createShareLink(user!, id, body);
    return res.ok
      ? NextResponse.json(res.value, { status: 201, headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: res.error }, { status: res.status });
  } catch (err) {
    console.error("POST /api/admin/memos/[id]/links error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
