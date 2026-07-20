// Part 10, WS27 — the one-time "sheetRowId linking" step. Pure matching
// logic only (no DB/network access), same extraction pattern as
// sheet-sync.ts, so it's fully unit-testable on synthetic rows (ground
// rule 1). The caller (src/app/api/admin/sheets-sync/link/route.ts) reads
// the live sheet + DB deals and hands both in here.
//
// This is NOT the recurring sync (sheet-sync.ts/sheet-sync-runner.ts) — it
// runs exactly once, matches each existing Deal to a sheet row by CONTENT
// (company + vehicle/fund + investment type + date, with amount as a
// tiebreaker), and reports a match per deal. It never invents data and
// never guesses: anything ambiguous or unmatched is flagged, not forced.
//
// Ported from scripts/link-sheet-rows.ts (now deleted — its matching logic
// lives here, and the write path is an admin-gated route instead of a
// standalone script, because GOOGLE_SA_EMAIL/GOOGLE_SA_PRIVATE_KEY are
// Vercel "Sensitive" env vars that can never be pulled locally; see
// docs/IMPLEMENTATION_PLAN.md's WS27 status note for the full story).

import { findColumn } from "@/lib/sheets";
import type { SheetTable } from "@/lib/sheets";
import { parseSheetDate, parseSheetCurrency } from "@/lib/sheet-sync";

const INVESTMENT_TYPE_MAP: Record<string, string> = {
  initial: "INITIAL",
  "follow-on": "FOLLOW_ON",
  "follow on": "FOLLOW_ON",
};

export interface SheetLinkRow {
  stableId: string;
  row: number; // 1-based sheet row, for human-readable reporting
  companyName: string;
  vehicleName: string;
  investmentType: string;
  dateKey: string; // yyyy-mm-dd
  amount: number | null;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function contentKey(companyName: string, vehicleName: string, investmentType: string, date: string): string {
  return `${companyName.trim().toLowerCase()}||${vehicleName.trim().toLowerCase()}||${investmentType}||${date}`;
}

/** Reads the sheet's rows into link candidates. Rows with no Stable ID, an unparseable date, or an unrecognized Investment value are skipped here — the recurring sync (sheet-sync.ts) is what reports those as errors; this step only cares about rows it could plausibly match against. */
export function parseSheetLinkRows(sheet: SheetTable): SheetLinkRow[] {
  const { header, rows } = sheet;
  const idCol = findColumn(header, "Stable ID column");
  const companyCol = findColumn(header, "Company");
  const vehicleCol = findColumn(header, "Vehicle");
  const investmentCol = findColumn(header, "Investment");
  const dateCol = findColumn(header, "Date");
  const amountCol = findColumn(header, "Amount");

  const candidates: SheetLinkRow[] = [];
  rows.forEach((row, i) => {
    const stableId = (row[idCol] ?? "").trim();
    if (!stableId) return;
    const date = parseSheetDate(row[dateCol]);
    if (!date) return;
    const investmentRaw = (row[investmentCol] ?? "").trim().toLowerCase();
    const investmentType = INVESTMENT_TYPE_MAP[investmentRaw];
    if (!investmentType) return;
    const amount = parseSheetCurrency(row[amountCol]);
    candidates.push({
      stableId,
      row: i + 2, // header is row 1, data starts row 2
      companyName: (row[companyCol] ?? "").trim(),
      vehicleName: (row[vehicleCol] ?? "").trim(),
      investmentType,
      dateKey: dateKey(date),
      amount: amount.ok ? amount.value : null,
    });
  });
  return candidates;
}

export interface LinkableDeal {
  id: string;
  sheetRowId: string | null;
  companyName: string;
  vehicleName: string;
  investmentType: string;
  dealDate: Date;
  amountUsd: number;
}

export interface DealLinkMatch {
  dealId: string;
  companyName: string;
  vehicleName: string;
  stableId: string | null;
  status: "matched" | "ambiguous" | "unmatched" | "already-linked";
  detail?: string;
}

/**
 * Matches each deal to a sheet row by content. Deals that already carry a
 * sheetRowId are reported as "already-linked" and never re-matched or
 * overwritten (idempotent — safe to re-run/re-apply). Deals process in the
 * order given by the caller; when two deals would independently match the
 * same sheet row (a duplicate content-key situation), only the first
 * claims it — the rest are reported "ambiguous" rather than silently
 * dropped or double-assigned.
 */
export function matchDealsToSheetRows(deals: LinkableDeal[], sheetRows: SheetLinkRow[]): DealLinkMatch[] {
  const byKey = new Map<string, SheetLinkRow[]>();
  for (const c of sheetRows) {
    const key = contentKey(c.companyName, c.vehicleName, c.investmentType, c.dateKey);
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }

  const results: DealLinkMatch[] = [];
  const usedStableIds = new Set<string>();

  for (const deal of deals) {
    if (deal.sheetRowId) {
      results.push({
        dealId: deal.id,
        companyName: deal.companyName,
        vehicleName: deal.vehicleName,
        stableId: deal.sheetRowId,
        status: "already-linked",
      });
      continue;
    }

    const key = contentKey(deal.companyName, deal.vehicleName, deal.investmentType, dateKey(deal.dealDate));
    let group = byKey.get(key) ?? [];

    if (group.length > 1) {
      // Tiebreak on amount.
      const narrowed = group.filter((c) => c.amount !== null && Math.abs(c.amount - deal.amountUsd) < 0.5);
      if (narrowed.length === 1) group = narrowed;
    }

    if (group.length === 0) {
      results.push({
        dealId: deal.id,
        companyName: deal.companyName,
        vehicleName: deal.vehicleName,
        stableId: null,
        status: "unmatched",
        detail: "no sheet row with matching company/vehicle/type/date",
      });
    } else if (group.length > 1) {
      results.push({
        dealId: deal.id,
        companyName: deal.companyName,
        vehicleName: deal.vehicleName,
        stableId: null,
        status: "ambiguous",
        detail: `${group.length} candidate sheet rows: ${group.map((c) => c.stableId).join(", ")}`,
      });
    } else {
      const candidate = group[0];
      if (usedStableIds.has(candidate.stableId)) {
        results.push({
          dealId: deal.id,
          companyName: deal.companyName,
          vehicleName: deal.vehicleName,
          stableId: null,
          status: "ambiguous",
          detail: `stable ID ${candidate.stableId} already claimed by another deal`,
        });
      } else {
        usedStableIds.add(candidate.stableId);
        results.push({ dealId: deal.id, companyName: deal.companyName, vehicleName: deal.vehicleName, stableId: candidate.stableId, status: "matched" });
      }
    }
  }

  return results;
}
