import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { getUploadUrl } from "@/lib/s3";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyId, name, mimeType, updateId, isInternal } = body;

    if (!companyId || typeof companyId !== "string") {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "File name is required" },
        { status: 400 }
      );
    }

    if (!mimeType || typeof mimeType !== "string") {
      return NextResponse.json(
        { error: "mimeType is required" },
        { status: 400 }
      );
    }

    const { user, error } = await requireCompanyAccess(companyId);
    if (error) return error;

    // Generate a unique S3 key
    const fileExtension = name.includes(".") ? name.split(".").pop() : "";
    const s3Key = `companies/${companyId}/documents/${randomUUID()}${fileExtension ? `.${fileExtension}` : ""}`;

    // Get presigned upload URL
    const uploadUrl = await getUploadUrl(s3Key, mimeType);

    // Create the document record
    const document = await db.document.create({
      data: {
        companyId,
        updateId: updateId || null,
        uploadedById: user!.id,
        name,
        s3Key,
        mimeType,
        isInternal: isInternal ?? false,
      },
    });

    return NextResponse.json({ uploadUrl, document }, { status: 201 });
  } catch (err) {
    console.error("POST /api/documents/upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
