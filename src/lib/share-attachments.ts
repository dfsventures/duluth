// B-249 — files a founder attached to an update, listed on that update's investor share link.
//
// The share page is public to anyone holding the link, so the rules live here, in one place,
// and both the page's data endpoint (/api/share/[token]) and the download route
// (/api/share/[token]/attachment/[docId]) use them:
//   1. which updates a link shows (shareUpdatesWhere — the same query the page has always used),
//   2. which of an update's documents are listed (SHARE_ATTACHMENT_WHERE: not internal, not archived),
//   3. what the browser is told about each one (SHARE_ATTACHMENT_SELECT: never s3Key).
// Downloads always go back through the token-checked route, which redirects to a short-lived
// signed URL (getDownloadUrl); the page never sees a storage key or a permanent URL.

import type { Prisma } from "@prisma/client";
import { endOfDayUTC } from "@/lib/share-metrics";

export interface ShareLinkScope {
  createdAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  companies: { companyId: string }[];
  selectedUpdates: { updateId: string }[];
}

/**
 * The updates a link shows, as a Prisma where, or null when it shows none.
 * Moved here unchanged from /api/share/[token]/route.ts so the download route can't drift from it.
 */
export function shareUpdatesWhere(link: ShareLinkScope): Prisma.UpdateWhereInput | null {
  if (link.selectedUpdates.length > 0) {
    // New-style link: the explicitly selected updates
    return { id: { in: link.selectedUpdates.map((u) => u.updateId) } };
  }
  if (link.periodStart && link.periodEnd) {
    // Legacy link: filter by company + period range
    return {
      companyId: { in: link.companies.map((c) => c.companyId) },
      status: "SENT",
      sentAt: { gte: link.periodStart, lte: endOfDayUTC(link.periodEnd) },
      // Part 45 (Q140 A, WS152): an update Marge files after this link was
      // made does not appear on it. Written as an explicit OR because
      // Prisma's NOT would also drop rows where filedAt is null (every
      // ordinary update).
      OR: [{ filedAt: null }, { filedAt: { lte: link.createdAt } }],
    };
  }
  // Legacy link with no period range and no explicit selection — nothing to show
  return null;
}

/** Documents an investor may see: admin-only (internal) and archived files never are. */
export const SHARE_ATTACHMENT_WHERE = { isInternal: false, archivedAt: null } as const;

/** What the share page receives per file. No s3Key, no URL. */
export const SHARE_ATTACHMENT_SELECT = {
  id: true,
  updateId: true,
  name: true,
  mimeType: true,
  size: true,
} as const;

export interface ShareAttachment {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

/** Group listed documents under their update, oldest first, keeping only the page's fields. */
export function groupAttachmentsByUpdate(
  docs: { id: string; updateId: string | null; name: string; mimeType: string | null; size: number | null }[]
): Map<string, ShareAttachment[]> {
  const byUpdate = new Map<string, ShareAttachment[]>();
  for (const d of docs) {
    if (!d.updateId) continue;
    const list = byUpdate.get(d.updateId) ?? [];
    list.push({ id: d.id, name: d.name, mimeType: d.mimeType, size: d.size });
    byUpdate.set(d.updateId, list);
  }
  return byUpdate;
}

/** Download path for one file on one link. The route re-checks everything. */
export function shareAttachmentPath(token: string, docId: string): string {
  return `/api/share/${encodeURIComponent(token)}/attachment/${encodeURIComponent(docId)}`;
}

/** Short type label for the list: the file's extension ("PDF", "XLSX"), else the MIME subtype. */
export function attachmentTypeLabel(name: string, mimeType: string | null): string {
  const ext = name.includes(".") ? name.split(".").pop()!.trim() : "";
  if (ext && ext.length <= 5) return ext.toUpperCase();
  const sub = mimeType?.split("/")[1]?.split(/[.+;-]/)[0];
  return sub ? sub.toUpperCase() : "File";
}
