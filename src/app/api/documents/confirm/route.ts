export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { headObject } from "@/lib/s3";
import { validateUploadFields } from "../upload/validate";

// Part 35, WS93.2 (D1 = B) — mirrors POST /api/admin/storage/test-upload/confirm
// exactly in structure: the client asserts nothing, the server asks storage.
// This is the only place a Document row is ever created. A presign with no
// matching confirm — or a confirm for a key the PUT never reached — leaves
// the documents table untouched, which is the whole point: a phantom row
// (F84/F85, two production incidents) is now structurally impossible rather
// than merely filtered out downstream.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const v = validateUploadFields(body); // same checks as presign — the client re-sends them
    if (!v.ok) return v.error;

    const { user, error } = await requireCompanyAccess(v.fields.companyId);
    if (error) return error;

    const { s3Key } = body as { s3Key?: unknown };
    // The key must be one we could have issued for THIS company. Prevents a
    // caller confirming against a key belonging to another company's prefix.
    if (
      typeof s3Key !== "string" ||
      !s3Key.startsWith(`companies/${v.fields.companyId}/documents/`)
    ) {
      return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
    }

    const head = await headObject(s3Key);
    if (!head) {
      return NextResponse.json(
        { error: "The file did not reach storage. Please try uploading it again." },
        { status: 502 }
      );
    }

    const document = await db.document.create({
      data: {
        companyId: v.fields.companyId,
        updateId: v.fields.updateId,
        uploadedById: user!.id,
        name: v.fields.name,
        s3Key,
        mimeType: v.fields.mimeType,
        isInternal: v.fields.isInternal,
        docType: v.fields.docType,
        size: head.contentLength ?? null, // F88 — storage's number, not the client's
      },
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    console.error("POST /api/documents/confirm error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
