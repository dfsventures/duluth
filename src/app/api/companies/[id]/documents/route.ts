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
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    // Part 16, WS42 (F33, Q59) — isInternal was previously a display
    // badge only, not access control: any member of the company (any
    // role) could list internal-only documents. Now filtered out for
    // non-admins. A role check, not a general uploader exception — but
    // (fixed here, found live via a real founder's DD re-upload) a
    // non-admin can still see the EXISTENCE of their own internal
    // upload (name/date, proof it was received), matching the same
    // "metadata only, not the file" precedent /diligence's
    // getDdDocumentSummary() already established. They still can't
    // view/download it (src/app/company/documents/page.tsx suppresses
    // those actions client-side for isInternal rows), and this still
    // never reveals a TEAMMATE's internal upload to a non-admin.
    const isAdmin = user!.roles.includes("ADMIN");

    const { searchParams } = new URL(request.url);
    const docType = searchParams.get("docType");
    const search = searchParams.get("search");
    const archived = searchParams.get("archived") === "true";

    const documents = await db.document.findMany({
      where: {
        companyId: id,
        ...(isAdmin ? {} : { OR: [{ isInternal: false }, { uploadedById: user!.id }] }),
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
