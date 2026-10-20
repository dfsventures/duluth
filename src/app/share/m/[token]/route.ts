export const dynamic = "force-dynamic";
import crypto from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { sha256Hex } from "@/lib/memo-actions";
import { readCitations } from "@/lib/memos";
import { renderMemoSharePage, renderShareStatePage, shareCsp, type ShareState } from "@/lib/memo-share-page";

// Part 40 (WS128). The public memo page. A route handler, not a page, because a page cannot answer
// 410 (see src/lib/memo-share-page.ts). Public by prefix in route-access.ts; the token is the
// authorization, exactly like Investor Links, except that only its SHA-256 fingerprint is stored.
// Never indexed, never cached, no referrer.

const MEMO_SHARE_PAGE_LIMIT_PER_HOUR = 120;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

const BASE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function stateResponse(state: ShareState) {
  const { status, html } = renderShareStatePage(state);
  const headers: Record<string, string> = { ...BASE_HEADERS, "Content-Security-Policy": shareCsp() };
  if (state === "rate_limited") headers["Retry-After"] = "3600";
  return new Response(html, { status, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!(await checkRateLimit("memo-share", clientIp(request), MEMO_SHARE_PAGE_LIMIT_PER_HOUR))) return stateResponse("rate_limited");
    if (!TOKEN_RE.test(token)) return stateResponse("not_found");

    const link = await db.shareableLink.findUnique({
      where: { tokenHash: sha256Hex(token) },
      select: {
        expiresAt: true,
        revokedAt: true,
        memo: {
          select: {
            title: true,
            status: true,
            updatedAt: true,
            archivedAt: true,
            draftedByMarge: true,
            websiteUrl: true,
            companyNamePending: true,
            company: { select: { name: true } },
            sections: {
              where: { includeInShare: true },
              orderBy: { position: "asc" },
              select: { title: true, markdown: true, citations: true, includeInShare: true },
            },
          },
        },
      },
    });
    if (!link || !link.memo) return stateResponse("not_found");
    if (link.revokedAt || link.memo.archivedAt) return stateResponse("revoked");
    if (link.expiresAt && link.expiresAt <= new Date()) return stateResponse("expired");

    const m = link.memo;
    const nonce = crypto.randomBytes(16).toString("base64");
    const html = renderMemoSharePage(
      {
        title: m.title,
        companyName: m.company?.name ?? m.companyNamePending,
        websiteUrl: m.websiteUrl,
        status: m.status,
        updatedAt: m.updatedAt,
        draftedByMarge: m.draftedByMarge,
        sections: m.sections.map((s) => ({ ...s, citations: readCitations(s.citations) })),
      },
      { token, nonce }
    );
    return new Response(html, { status: 200, headers: { ...BASE_HEADERS, "Content-Security-Policy": shareCsp(nonce) } });
  } catch (err) {
    console.error("GET /share/m/[token] error:", err);
    return stateResponse("error");
  }
}
