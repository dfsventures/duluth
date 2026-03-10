export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import { getDownloadUrl } from "@/lib/s3";

// Redirects to the presigned S3 URL so images render inline in the rich editor
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const document = await db.document.findUnique({
      where: { id },
      select: { s3Key: true, companyId: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await requireCompanyAccess(document.companyId);
    if (error) return error;

    const url = await getDownloadUrl(document.s3Key);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("GET /api/documents/[id]/view error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
