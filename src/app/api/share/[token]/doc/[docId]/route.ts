export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDownloadUrl } from "@/lib/s3";

// F16 fix (option b): token-scoped document proxy for inline images in
// shared update bodies. The share link's token is the authorization,
// exactly like /api/share/[token] itself — but scoped: the document must
// belong to a company covered by the link and must not be internal-only.
// Deliberately NOT a general public documents endpoint; /api/documents
// stays session-gated (the June IDOR fix).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; docId: string }> }
) {
  try {
    const { token, docId } = await params;

    const link = await db.shareableLink.findUnique({
      where: { token },
      select: {
        expiresAt: true,
        companies: { select: { companyId: true } },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Same expiry rule as the main share endpoint
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    const document = await db.document.findUnique({
      where: { id: docId },
      select: { s3Key: true, companyId: true, isInternal: true },
    });

    // 404 (not 403) for every rejection: don't leak whether a document
    // exists outside this link's scope.
    if (
      !document ||
      document.isInternal ||
      !link.companies.some((c) => c.companyId === document.companyId)
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const url = await getDownloadUrl(document.s3Key);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("GET /api/share/[token]/doc/[docId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
