export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { getUploadUrl } from "@/lib/s3";
import { randomUUID } from "crypto";
import { validateUploadFields } from "./validate";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const v = validateUploadFields(body);
    if (!v.ok) return v.error;

    const { error } = await requireCompanyAccess(v.fields.companyId);
    if (error) return error;

    // Generate a unique S3 key
    const s3Key = `companies/${v.fields.companyId}/documents/${randomUUID()}.${v.fields.fileExtension}`;

    // Get presigned upload URL
    const uploadUrl = await getUploadUrl(s3Key, v.fields.mimeType);

    // Part 35, WS93 (F84) — no Document row is created here anymore. The row
    // gets written by POST /api/documents/confirm, and only after
    // headObject() proves the bytes actually landed. Two production
    // incidents (2026-08 credential/CORS, 2026-09-04 domain-change CORS)
    // both produced rows for files that never existed; this makes that
    // state unrepresentable rather than detectable.
    return NextResponse.json({ uploadUrl, s3Key }, { status: 200 });
  } catch (err) {
    console.error("POST /api/documents/upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
