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
import {
  sendDiligenceCompletedAdminNotification,
  sendDiligenceCompletedFounderEmail,
} from "@/lib/email";

// Part 16, WS40 — founder-facing DD checklist state (Q53-Q60).
// GET/PATCH both recompute `completedAt` on every call (JC-DD-F).

// F36/WS44 (JC-DD-H/I) — fires the two completion emails exactly once, at
// the DB write that flips completedAt from null to non-null. Never
// awaited on the response — same fire-and-forget convention as
// sendDiligenceInviteEmail (WS39).
function notifyIfJustCompleted(opts: {
  wasComplete: boolean;
  completedAt: Date | null;
  companyId: string;
  companyName: string;
  user: { email: string; name?: string | null; roles: string[] };
}) {
  if (opts.wasComplete || !opts.completedAt) return; // not a fresh completion
  if (opts.user.roles.includes("ADMIN")) return; // JC-DD-I

  const founderName = opts.user.name ?? null;

  sendDiligenceCompletedFounderEmail({
    toEmail: opts.user.email,
    founderName,
    companyName: opts.companyName,
  }).catch((err) => console.error("Failed to send diligence-completed founder email:", err));

  sendDiligenceCompletedAdminNotification({
    companyName: opts.companyName,
    founderName,
    founderEmail: opts.user.email,
  }).catch((err) => console.error("Failed to send diligence-completed admin notification:", err));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    const company = await db.company.findUnique({
      where: { id },
      select: { name: true, stage: true, diligence: true },
    });

    if (!company || !company.diligence) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hasPassportDocument = await hasActivePassportDocument(id);
    const wasComplete = !!company.diligence.completedAt;
    const completedAt = await recomputeDiligenceCompletion(id, company.diligence, hasPassportDocument);
    notifyIfJustCompleted({ wasComplete, completedAt, companyId: id, companyName: company.name, user: user! });
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
    const { user, error } = await requireCompanyAccess(id);
    if (error) return error;

    const existing = await db.companyDiligence.findUnique({
      where: { companyId: id },
      include: { company: { select: { name: true } } },
    });
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
    const wasComplete = !!existing.completedAt;
    const completedAt = await recomputeDiligenceCompletion(id, updated, hasPassportDocument);
    notifyIfJustCompleted({ wasComplete, completedAt, companyId: id, companyName: existing.company.name, user: user! });
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
