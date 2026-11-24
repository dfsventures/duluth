export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDownloadUrl } from "@/lib/s3";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { SHARE_ATTACHMENT_WHERE, shareUpdatesWhere } from "@/lib/share-attachments";

// B-249: download one file attached to an update shown on an investor share link.
//
// Public (the /api/share prefix): the link's token is the authorization. Every request
// re-checks the same things the share page's data endpoint does (link exists, is an investor
// link, not revoked, not expired), then that the file is attached to an update this link
// actually shows (the same where, from src/lib/share-attachments.ts) and is neither internal
// nor archived. Only then does it redirect to a short-lived signed URL. Stricter than the
// inline-image proxy at ../doc/[docId], which is company-scoped.
const SHARE_ATTACHMENT_LIMIT_PER_HOUR = 240;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; docId: string }> }
) {
  try {
    const { token, docId } = await params;
    if (!(await checkRateLimit("share-attachment", clientIp(request), SHARE_ATTACHMENT_LIMIT_PER_HOUR))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const link = await db.shareableLink.findUnique({
      where: { token, memoId: null }, // investor links only
      select: {
        createdAt: true,
        periodStart: true,
        periodEnd: true,
        expiresAt: true,
        revokedAt: true,
        companies: { select: { companyId: true } },
        selectedUpdates: { select: { updateId: true } },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    if (link.revokedAt) {
      return NextResponse.json({ error: "This link is no longer available" }, { status: 410 });
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    const document = await db.document.findFirst({
      where: { id: docId, ...SHARE_ATTACHMENT_WHERE },
      select: { s3Key: true, updateId: true },
    });

    // 404 (not 403) for every rejection below: don't leak whether a file exists outside this link.
    const updatesWhere = shareUpdatesWhere(link);
    if (!document || !document.updateId || !updatesWhere) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const update = await db.update.findFirst({
      where: { AND: [updatesWhere, { id: document.updateId }] },
      select: { id: true },
    });
    if (!update) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const url = await getDownloadUrl(document.s3Key);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("GET /api/share/[token]/attachment/[docId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
