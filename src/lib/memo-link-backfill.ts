// Part 42 (WS139). The logic behind scripts/link-memo-companies.ts: classify the memos that still carry
// a typed company name, and (only with write) link the confident ones. Kept here so it is tested with a
// fake database; the CLI is a thin shell. Names stay on screen: audit rows hold ids only.
import { db } from "@/lib/db";
import type { Actor } from "@/lib/board-actions";
import { linkTarget, loadLinkCandidates } from "@/lib/memo-actions";
import { matchMemoCompany, type LinkCandidate } from "@/lib/memos";

export type BackfillAction = "link" | "check" | "pending";

export interface BackfillRow {
  memoId: string;
  title: string;
  decision: string | null;
  pendingName: string;
  action: BackfillAction;
  /** The confident target ("link" rows). */
  target: LinkCandidate | null;
  /** Everything worth a look ("check" rows): several exact targets, or near matches only. */
  candidates: LinkCandidate[];
  /** Set only by a write run. */
  result?: "linked" | "stale" | "failed";
  error?: string;
}

export interface BackfillReport {
  rows: BackfillRow[];
  /** Pending memos owned by someone other than the actor: never touched (linking is owner-only, Q117-A). */
  skippedOtherOwner: number;
  totals: { link: number; linkToCompany: number; linkToLedger: number; check: number; pending: number };
  written: { linked: number; stale: number; failed: number } | null;
}

/**
 * `actor` must be the memos' owner (an approved admin; the CLI checks). Scope: non-archived memos with a
 * pending name and neither target set. `write: false` only reads. `write: true` links only the "link" rows,
 * one linkTarget call each with the memo's current version (a memo edited meanwhile is counted stale, never forced).
 * linkTarget keeps `updatedAt` (Q135-A), so imported memos keep Notion's dates.
 */
export async function runBackfill(
  actor: Actor,
  opts: { write: boolean; only?: string; importedOnly?: boolean }
): Promise<BackfillReport> {
  const pendingMemos = await db.memo.findMany({
    where: {
      archivedAt: null,
      companyId: null,
      portfolioCompanyId: null,
      companyNamePending: { not: null },
      ...(opts.importedOnly ? { notionId: { not: null } } : {}),
      ...(opts.only ? { id: opts.only } : {}),
    },
    select: { id: true, title: true, ownerId: true, decision: true, companyNamePending: true, version: true },
    orderBy: { createdAt: "asc" },
  });
  const mine = pendingMemos.filter((m) => m.ownerId === actor.id);
  const { companies, ledger } = await loadLinkCandidates();

  const rows: BackfillRow[] = mine.map((m) => {
    const name = m.companyNamePending ?? "";
    const match = matchMemoCompany(name, companies, ledger);
    const base = { memoId: m.id, title: m.title, decision: m.decision, pendingName: name };
    if (match.confident) return { ...base, action: "link" as const, target: match.confident, candidates: [] };
    const candidates = [...match.exact, ...match.near];
    if (candidates.length) return { ...base, action: "check" as const, target: null, candidates };
    return { ...base, action: "pending" as const, target: null, candidates: [] };
  });

  const totals = {
    link: rows.filter((r) => r.action === "link").length,
    linkToCompany: rows.filter((r) => r.action === "link" && r.target?.kind === "company").length,
    linkToLedger: rows.filter((r) => r.action === "link" && r.target?.kind === "ledger").length,
    check: rows.filter((r) => r.action === "check").length,
    pending: rows.filter((r) => r.action === "pending").length,
  };

  let written: BackfillReport["written"] = null;
  if (opts.write) {
    written = { linked: 0, stale: 0, failed: 0 };
    for (const row of rows) {
      if (row.action !== "link" || !row.target) continue;
      const version = mine.find((m) => m.id === row.memoId)!.version;
      const body = row.target.kind === "company" ? { companyId: row.target.id } : { portfolioCompanyId: row.target.id };
      const r = await linkTarget(actor, row.memoId, body, version, { source: "backfill" });
      if (r.ok) {
        row.result = "linked";
        written.linked++;
      } else if (r.status === 409) {
        row.result = "stale";
        written.stale++;
      } else {
        row.result = "failed";
        row.error = r.error;
        written.failed++;
      }
    }
  }

  return { rows, skippedOtherOwner: pendingMemos.length - mine.length, totals, written };
}
