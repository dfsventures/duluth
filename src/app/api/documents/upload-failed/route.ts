export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { logAdminAction } from "@/lib/audit";

// Part 35, WS95.1 (D2 = A) — a fire-and-forget failure beacon called from
// src/lib/upload-document.ts's catch paths. Under D1 = B a failed upload
// leaves no Document row anywhere, so this audit row is the *only* durable
// trace that an upload was attempted and failed — this is why it exists,
// not decoration. Never blocks or fails the upload: logAdminAction already
// swallows its own errors, and this route swallows everything else too.
export async function POST(request: Request) {
  try {
    const { companyId, name, stage, detail } = await request.json();
    const { user, error } = await requireCompanyAccess(companyId);
    if (error) return error;
    await logAdminAction(user!, "DOCUMENT_UPLOAD_FAILED", {
      targetType: "Company",
      targetId: companyId,
      metadata: {
        name: typeof name === "string" ? name : null,
        stage: typeof stage === "string" ? stage : null,
        // F87 — this is the raw browser/server string, meaningless to the
        // founder but genuinely useful to whoever debugs it.
        detail: typeof detail === "string" ? detail.slice(0, 300) : null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }); // never surfaces to the founder
  }
}
