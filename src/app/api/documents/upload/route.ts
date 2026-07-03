export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { getUploadUrl } from "@/lib/s3";
import { ALLOWED_UPLOAD_TYPES } from "@/lib/constants";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companyId, name, mimeType, updateId, isInternal, docType } = body;

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

    if (name.length > 255) {
      return NextResponse.json(
        { error: "File name is too long." },
        { status: 400 }
      );
    }

    const normalizedMimeType = mimeType.toLowerCase();
    const allowedExtensions = ALLOWED_UPLOAD_TYPES[normalizedMimeType];
    if (!allowedExtensions) {
      return NextResponse.json(
        {
          error:
            "This file type is not supported. Supported types: PDF, Office documents, images, CSV, TXT, ZIP, MP4/MOV video.",
        },
        { status: 400 }
      );
    }

    const fileExtension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: `File extension ".${fileExtension}" does not match the file type.` },
        { status: 400 }
      );
    }

    const { user, error } = await requireCompanyAccess(companyId);
    if (error) return error;

    // Generate a unique S3 key
    const s3Key = `companies/${companyId}/documents/${randomUUID()}.${fileExtension}`;

    // Get presigned upload URL
    const uploadUrl = await getUploadUrl(s3Key, normalizedMimeType);

    // Create the document record
    const document = await db.document.create({
      data: {
        companyId,
        updateId: updateId || null,
        uploadedById: user!.id,
        name,
        s3Key,
        mimeType: normalizedMimeType,
        isInternal: isInternal ?? false,
        docType: docType ?? null,
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
