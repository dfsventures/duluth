export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { objectExists } from "@/lib/s3";
import { logAdminAction } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const document = await db.document.findUnique({ where: { id } });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Re-verify at delete time, not just trusting the earlier scan result —
    // cheap, and guards against acting on a stale list (e.g. this exact
    // row's upload was retried and actually landed in the interim).
    const exists = await objectExists(document.s3Key);
    if (exists) {
      return NextResponse.json(
        { error: "This document's file now exists in storage — refusing to delete. Re-run the scan." },
        { status: 409 }
      );
    }

    await db.document.delete({ where: { id } });
    await logAdminAction(user!, "DOCUMENT_ORPHAN_DELETED", {
      targetType: "Document",
      targetId: id,
      metadata: { name: document.name, companyId: document.companyId, s3Key: document.s3Key },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/documents/[id]/orphan error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
