export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";
import { DD_DOC_TYPES } from "@/lib/constants";
import { diligenceProgress, recomputeDiligenceCompletion } from "@/lib/diligence";

// Part 16, WS41 (JC-DD-G) — the admin DD review queue. Its own page,
// deliberately not folded into /admin/approvals: this reviews
// Company/CompanyDiligence rows (documents + questionnaire), not User
// rows (a yes/no on a person). Client splits the response into
// "Awaiting founder" / "Ready for review" by `diligence.completedAt`,
// same idiom as the existing Approvals/Awaiting-setup split.

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const companies = await db.company.findMany({
      where: { stage: "DILIGENCE" },
      orderBy: { createdAt: "asc" },
      include: {
        diligence: true,
        memberships: {
          where: { role: "OWNER" },
          take: 1,
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });

    const ddCompanyIds = companies.map((c) => c.id);
    const ddDocTypeValues = DD_DOC_TYPES.map((t) => t.value);

    const documents = ddCompanyIds.length
      ? await db.document.findMany({
          where: { companyId: { in: ddCompanyIds }, archivedAt: null, docType: { in: ddDocTypeValues } },
          select: { companyId: true, docType: true },
        })
      : [];

    const result = await Promise.all(
      companies.map(async (company) => {
        const diligence = company.diligence;
        const founder = company.memberships[0]?.user ?? null;
        const companyDocs = documents.filter((d) => d.companyId === company.id);
        const documentCounts: Record<string, number> = {};
        for (const docType of ddDocTypeValues) {
          documentCounts[docType] = companyDocs.filter((d) => d.docType === docType).length;
        }
        const hasPassportDocument = documentCounts.passport > 0;

        if (!diligence) {
          // Shouldn't happen (WS39 always creates one alongside a
          // DILIGENCE-stage company), but keep this route resilient.
          return {
            id: company.id,
            name: company.name,
            createdAt: company.createdAt,
            founder,
            diligence: null,
            documentCounts,
            progress: { done: 0, total: 2 },
          };
        }

        const completedAt = await recomputeDiligenceCompletion(company.id, diligence, hasPassportDocument);
        const progress = diligenceProgress({
          isUsIncorporated: diligence.isUsIncorporated,
          isStellarEcosystem: diligence.isStellarEcosystem,
          stellarWhyText: diligence.stellarWhyText,
          stellarTimelineText: diligence.stellarTimelineText,
          hasPassportDocument,
        });

        return {
          id: company.id,
          name: company.name,
          createdAt: company.createdAt,
          founder,
          diligence: { ...diligence, completedAt },
          documentCounts,
          progress,
        };
      })
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/admin/diligence error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
