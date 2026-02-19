export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const docType = searchParams.get("docType");
    const search = searchParams.get("search");
    const archived = searchParams.get("archived") === "true";

    const documents = await db.document.findMany({
      where: {
        companyId: id,
        archivedAt: archived ? { not: null } : null,
        ...(docType ? { docType } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        isInternal: true,
        docType: true,
        archivedAt: true,
        createdAt: true,
        uploadedBy: {
          select: { name: true, email: true },
        },
      },
    });

    const result = documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      mimeType: doc.mimeType,
      size: doc.size,
      isInternal: doc.isInternal,
      docType: doc.docType,
      archivedAt: doc.archivedAt,
      createdAt: doc.createdAt,
      uploadedBy: doc.uploadedBy?.name ?? doc.uploadedBy?.email ?? null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/companies/[id]/documents error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
