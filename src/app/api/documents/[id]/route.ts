export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { getDownloadUrl } from "@/lib/s3";

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

    const { error } = await requireCompanyAccess(document.companyId);
    if (error) return error;

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
