export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { getDownloadUrl } from "@/lib/s3";
import { DOC_TYPES } from "@/lib/constants";

const VALID_DOC_TYPES = DOC_TYPES.map((d) => d.value);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const document = await db.document.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const { user, error } = await requireCompanyAccess(document.companyId);
    if (error) return error;

    // Part 16, WS42 (F33, Q59) — role check, not an uploader exception:
    // an internal document stays 403 even for the founder who uploaded
    // it, once an admin has flagged it isInternal.
    if (document.isInternal && !user!.roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const downloadUrl = await getDownloadUrl(document.s3Key);

    return NextResponse.json({
      ...document,
      downloadUrl,
    });
  } catch (err) {
    console.error("GET /api/documents/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const document = await db.document.findUnique({
      where: { id },
      select: { companyId: true, archivedAt: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { error } = await requireCompanyAccess(document.companyId);
    if (error) return error;

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.docType !== undefined) {
      if (body.docType !== null && !VALID_DOC_TYPES.includes(body.docType)) {
        return NextResponse.json({ error: "Invalid docType" }, { status: 400 });
      }
      data.docType = body.docType;
    }

    if (body.archive === true) {
      data.archivedAt = new Date();
    } else if (body.archive === false) {
      data.archivedAt = null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await db.document.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/documents/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
