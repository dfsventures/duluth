export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { buildMetricDateFilter, buildMetricSummary } from "@/lib/share-metrics";
import {
  SHARE_ATTACHMENT_SELECT,
  SHARE_ATTACHMENT_WHERE,
  groupAttachmentsByUpdate,
  shareUpdatesWhere,
} from "@/lib/share-attachments";
import { rewriteDocumentUrls } from "@/lib/share-docs";
import { normalizeLogoPlate, themeForStored } from "@/lib/brand-theme";
import { logoPublicPath } from "@/lib/company-logo";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { sanitizeUpdateHtml } from "@/lib/update-html";

// Part 40 (WS130, F126): this public endpoint had no rate limit.
const SHARE_PAGE_LIMIT_PER_HOUR = 240;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!(await checkRateLimit("share-page", clientIp(request), SHARE_PAGE_LIMIT_PER_HOUR))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const link = await db.shareableLink.findUnique({
      where: { token, memoId: null }, // investor links only; memo links live under /share/m
      include: {
        companies: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                description: true,
                sector: true,
                geography: true,
                fundingStage: true,
                website: true,
                // Theming inputs only. Everything else about a company stays private.
                brandColor: true,
                logoPlate: true,
                logoWebKey: true,
                logoWidth: true,
                logoHeight: true,
              },
            },
          },
        },
        selectedUpdates: { select: { updateId: true } },
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Check expiry
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    const companyIds = link.companies.map((c) => c.companyId);
    const updateSelect = {
      id: true,
      companyId: true,
      title: true,
      period: true,
      body: true,
      sentAt: true,
      createdAt: true,
      company: { select: { id: true, name: true } },
      metricValues: {
        select: {
          id: true,
          value: true,
          date: true,
          metricDefinition: { select: { name: true, unit: true } },
        },
      },
    } as const;

    // Which updates this link shows: selected updates, or company + period for legacy links.
    // The rule lives in src/lib/share-attachments.ts so the attachment download route uses the same one.
    const updatesWhere = shareUpdatesWhere(link);
    const updates: Prisma.UpdateGetPayload<{ select: typeof updateSelect }>[] = updatesWhere
      ? await db.update.findMany({ where: updatesWhere, select: updateSelect, orderBy: { sentAt: "desc" } })
      : [];

    // B-249: files attached to the shown updates (never internal or archived; never s3Key).
    const attachmentsByUpdate = groupAttachmentsByUpdate(
      updates.length > 0
        ? await db.document.findMany({
            where: { updateId: { in: updates.map((u) => u.id) }, ...SHARE_ATTACHMENT_WHERE },
            select: SHARE_ATTACHMENT_SELECT,
            orderBy: { createdAt: "asc" },
          })
        : []
    );

    // Metric summary: latest value per metric across the relevant companies.
    // Scoping rules live in src/lib/share-metrics.ts (pure, unit-tested).
    const metricDateFilter = buildMetricDateFilter({
      metricScope: link.metricScope,
      periodStart: link.periodStart,
      periodEnd: link.periodEnd,
      hasSelectedUpdates: link.selectedUpdates.length > 0,
    });

    const metricValues = await db.metricValue.findMany({
      where: {
        metricDefinition: { companyId: { in: companyIds } },
        ...metricDateFilter,
        // Part 45 (Q140 A, WS152): figures Marge files after this link was made
        // stay off it. Explicit OR for the same null reason as above.
        AND: [{ OR: [{ via: null }, { createdAt: { lte: link.createdAt } }] }],
      },
      select: {
        id: true,
        value: true,
        date: true,
        metricDefinition: { select: { name: true, unit: true, companyId: true } },
      },
      orderBy: { date: "desc" },
    });

    // Per-company metric summary (latest value per metric in range) —
    // logic in src/lib/share-metrics.ts
    const metricsByCompany = buildMetricSummary(metricValues);

    // Derived server-side from the stored hex only; a bad stored value yields
    // null (the DFS default) rather than reaching a style attribute.
    const companyThemes = link.companies.map((c) => themeForStored(c.company.brandColor));

    return NextResponse.json({
      id: link.id,
      label: link.label,
      periodStart: link.periodStart,
      periodEnd: link.periodEnd,
      expiresAt: link.expiresAt,
      // Page-level theme only when the link covers exactly one company (D1);
      // multi-company links theme each company's own card instead.
      theme: companyThemes.length === 1 ? companyThemes[0] : null,
      companies: link.companies.map((c, i) => {
        const { brandColor, logoPlate, logoWebKey, logoWidth, logoHeight, ...company } = c.company;
        void brandColor; // the raw pick is not exposed; the client gets the derived theme
        return {
          ...company,
          theme: companyThemes[i],
          logoUrl: logoPublicPath(c.companyId, logoWebKey),
          logoPlate: normalizeLogoPlate(logoPlate) ?? "LIGHT",
          logoSquare: !!logoWidth && !!logoHeight && logoWidth / logoHeight < 1.15,
          metrics: metricsByCompany[c.companyId] ?? [],
        };
      }),
      // Inline document images are rewritten to the token-scoped proxy so
      // they render for sessionless investors (F16, option b)
      // Part 40 (WS130, F125): the body is founder-written HTML on a public page, so it is sanitized
      // here (after the rewrite, which produces URLs the sanitizer allows) and again at render.
      updates: updates.map((u) => ({
        ...u,
        body: sanitizeUpdateHtml(rewriteDocumentUrls(u.body, token)),
        attachments: attachmentsByUpdate.get(u.id) ?? [],
      })),
    });
  } catch (err) {
    console.error("GET /api/share/[token] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
