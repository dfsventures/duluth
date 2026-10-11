// Founder read-only view of DFS broadcasts, scoped by company.
// A Company links to a PortfolioCompany via PortfolioCompany.companyId (unique).
// A broadcast is visible to a company iff it is PUBLISHED and has a
// CompanyBroadcastTarget for that company's PortfolioCompany. Selects are
// explicit: never recipients, delivery state, other targets, or the author.

import { db } from "@/lib/db";
import { sanitizeBroadcastHtml } from "@/lib/broadcast-html";

export function visibleToCompany(companyId: string) {
  return {
    status: "PUBLISHED",
    targets: { some: { portfolioCompany: { companyId } } },
  };
}

export interface FounderBroadcastListItem {
  id: string;
  subject: string;
  publishedAt: Date | null;
}

export interface FounderBroadcastDetail extends FounderBroadcastListItem {
  body: string; // sanitized
}

export async function listBroadcastsForCompany(companyId: string, limit?: number): Promise<FounderBroadcastListItem[]> {
  return db.companyBroadcast.findMany({
    where: visibleToCompany(companyId),
    orderBy: { publishedAt: "desc" },
    ...(limit ? { take: limit } : {}),
    select: { id: true, subject: true, publishedAt: true },
  });
}

export async function getBroadcastForCompany(companyId: string, broadcastId: string): Promise<FounderBroadcastDetail | null> {
  const row = await db.companyBroadcast.findFirst({
    where: { id: broadcastId, ...visibleToCompany(companyId) },
    select: { id: true, subject: true, publishedAt: true, body: true },
  });
  return row ? { ...row, body: sanitizeBroadcastHtml(row.body) } : null;
}
