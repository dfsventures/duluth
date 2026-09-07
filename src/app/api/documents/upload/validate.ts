import { NextResponse } from "next/server";
import { ALLOWED_UPLOAD_TYPES } from "@/lib/constants";

// Part 35, WS93.1 — the presign route (POST /api/documents/upload) and the
// confirm route (POST /api/documents/confirm) must accept exactly the same
// fields under exactly the same rules, since the confirm route re-validates
// what the client re-sends rather than trusting anything about the earlier
// presign call. Extracted here so the two routes cannot drift.

export type UploadFields = {
  companyId: string;
  name: string;
  mimeType: string;
  updateId?: string | null;
  isInternal?: boolean;
  docType?: string | null;
};

export type ValidatedUploadFields = {
  companyId: string;
  name: string;
  mimeType: string;
  fileExtension: string;
  updateId: string | null;
  isInternal: boolean;
  docType: string | null;
};

/** Returns the normalized fields + resolved extension, or a NextResponse to return. */
export function validateUploadFields(
  body: unknown
): { ok: true; fields: ValidatedUploadFields } | { ok: false; error: NextResponse } {
  const { companyId, name, mimeType, updateId, isInternal, docType } =
    (body ?? {}) as Record<string, unknown>;

  if (!companyId || typeof companyId !== "string") {
    return { ok: false, error: NextResponse.json({ error: "companyId is required" }, { status: 400 }) };
  }

  if (!name || typeof name !== "string") {
    return { ok: false, error: NextResponse.json({ error: "File name is required" }, { status: 400 }) };
  }

  if (!mimeType || typeof mimeType !== "string") {
    return { ok: false, error: NextResponse.json({ error: "mimeType is required" }, { status: 400 }) };
  }

  if (name.length > 255) {
    return { ok: false, error: NextResponse.json({ error: "File name is too long." }, { status: 400 }) };
  }

  const normalizedMimeType = mimeType.toLowerCase();
  const allowedExtensions = ALLOWED_UPLOAD_TYPES[normalizedMimeType];
  if (!allowedExtensions) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error:
            "This file type is not supported. Supported types: PDF, Office documents, images, CSV, TXT, ZIP, MP4/MOV video.",
        },
        { status: 400 }
      ),
    };
  }

  const fileExtension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!allowedExtensions.includes(fileExtension)) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: `File extension ".${fileExtension}" does not match the file type.` },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true,
    fields: {
      companyId,
      name,
      mimeType: normalizedMimeType,
      fileExtension,
      updateId: (updateId as string | null | undefined) || null,
      isInternal: (isInternal as boolean | undefined) ?? false,
      docType: (docType as string | null | undefined) ?? null,
    },
  };
}
