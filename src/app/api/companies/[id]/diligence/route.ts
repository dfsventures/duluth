export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyAccess } from "@/lib/auth-guard";
import {
  diligenceProgress,
  getDdDocumentSummary,
  hasActivePassportDocument,
  recomputeDiligenceCompletion,
} from "@/lib/diligence";

// Part 16, WS40 — founder-facing DD checklist state (Q53-Q60).
// GET/PATCH both recompute `completedAt` on every call (JC-DD-F).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const company = await db.company.findUnique({
      where: { id },
      select: { stage: true, diligence: true },
    });

    if (!company || !company.diligence) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasPassportDocument = await hasActivePassportDocument(id);
    const completedAt = await recomputeDiligenceCompletion(id, company.diligence, hasPassportDocument);
    const progress = diligenceProgress({
      isUsIncorporated: company.diligence.isUsIncorporated,
      isStellarEcosystem: company.diligence.isStellarEcosystem,
      stellarWhyText: company.diligence.stellarWhyText,
      stellarTimelineText: company.diligence.stellarTimelineText,
      hasPassportDocument,
    });
    const documents = await getDdDocumentSummary(id);

    return NextResponse.json({
      ...company.diligence,
      completedAt,
      stage: company.stage,
      progress,
      documents,
    });
  } catch (err) {
    console.error("GET /api/companies/[id]/diligence error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await requireCompanyAccess(id);
    if (error) return error;

    const existing = await db.companyDiligence.findUnique({ where: { companyId: id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    // Client-writable fields only — completedAt/closedAt/isStellarEcosystem
    // are never accepted here (completedAt is recomputed below;
    // closedAt/isStellarEcosystem are admin-only, set elsewhere).
    if (typeof body.isUsIncorporated === "boolean") {
      data.isUsIncorporated = body.isUsIncorporated;
    }
    if (typeof body.stellarWhyText === "string") {
      data.stellarWhyText = body.stellarWhyText;
    }
    if (typeof body.stellarTimelineText === "string") {
      data.stellarTimelineText = body.stellarTimelineText;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await db.companyDiligence.update({ where: { companyId: id }, data });

    const hasPassportDocument = await hasActivePassportDocument(id);
    const completedAt = await recomputeDiligenceCompletion(id, updated, hasPassportDocument);
    const progress = diligenceProgress({
      isUsIncorporated: updated.isUsIncorporated,
      isStellarEcosystem: updated.isStellarEcosystem,
      stellarWhyText: updated.stellarWhyText,
      stellarTimelineText: updated.stellarTimelineText,
      hasPassportDocument,
    });
    const documents = await getDdDocumentSummary(id);

    return NextResponse.json({ ...updated, completedAt, progress, documents });
  } catch (err) {
    console.error("PATCH /api/companies/[id]/diligence error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
