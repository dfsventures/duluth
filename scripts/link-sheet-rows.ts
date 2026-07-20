/**
 * One-time backfill (Part 10, WS27's "sheetRowId linking step"): matches
 * each of Molly's existing Deal rows to a row in the live "All Deals"
 * Google Sheet by CONTENT — company name + vehicle (fund name) +
 * investment type + deal date, with amount as a tiebreaker — and, on a
 * confident match, writes the sheet's "Stable ID column" value
 * (D-0001..D-0076) into Deal.sheetRowId. This is the one-time identity
 * link the recurring sync (src/lib/sheet-sync-runner.ts) depends on:
 * without it, every existing deal would look "new" to the sync and get
 * duplicated.
 *
 * Deliberately NOT matched by row position/order — the sheet has been
 * reordered before and may be again; identity comes from content, and
 * going forward from a stable ID (JC19/Q26).
 *
 * CONFIDENTIALITY: reads the live sheet + prod deal data. Dry-run output
 * prints real names to the terminal only — never paste it into a commit,
 * PR body, or issue (same convention as scripts/backfill-rounds.ts).
 *
 * Idempotent: a deal with sheetRowId already set is skipped entirely
 * (never re-matched, never overwritten).
 *
 * Safety: --apply refuses to write ANYTHING if the dry run surfaces any
 * ambiguous or failed match anywhere in the set — this script does not
 * guess or force-match. Fix the data (sheet or DB) and re-run dry-run
 * until it's clean, then --apply.
 *
 * Usage:
 *   # dry run (default) — reads sheet + DB, reports matches; writes nothing
 *   DATABASE_URL="<...>" GOOGLE_SA_EMAIL="<...>" GOOGLE_SA_PRIVATE_KEY="<...>" \
 *     SHEETS_SPREADSHEET_ID="<...>" npx tsx scripts/link-sheet-rows.ts
 *
 *   # apply — writes Deal.sheetRowId for confidently-matched deals only
 *   DATABASE_URL="<...>" GOOGLE_SA_EMAIL="<...>" GOOGLE_SA_PRIVATE_KEY="<...>" \
 *     SHEETS_SPREADSHEET_ID="<...>" npx tsx scripts/link-sheet-rows.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { getSheetRows, findColumn, sheetsSyncEnabled } from "../src/lib/sheets";
import { parseSheetDate, parseSheetCurrency } from "../src/lib/sheet-sync";

const INVESTMENT_TYPE_MAP: Record<string, string> = {
  initial: "INITIAL",
  "follow-on": "FOLLOW_ON",
  "follow on": "FOLLOW_ON",
};

interface SheetCandidate {
  stableId: string;
  row: number; // 1-based sheet row, for the report
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

async function loadSheetCandidates(): Promise<SheetCandidate[]> {
  const { header, rows } = await getSheetRows();
  const idCol = findColumn(header, "Stable ID column");
  const companyCol = findColumn(header, "Company");
  const vehicleCol = findColumn(header, "Vehicle");
  const investmentCol = findColumn(header, "Investment");
  const dateCol = findColumn(header, "Date");
  const amountCol = findColumn(header, "Amount");

  const candidates: SheetCandidate[] = [];
  rows.forEach((row, i) => {
    const stableId = (row[idCol] ?? "").trim();
    if (!stableId) return; // reported separately by the recurring sync; not this script's job
    const date = parseSheetDate(row[dateCol]);
    if (!date) return;
    const investmentRaw = (row[investmentCol] ?? "").trim().toLowerCase();
    const investmentType = INVESTMENT_TYPE_MAP[investmentRaw];
    if (!investmentType) return;
    const amount = parseSheetCurrency(row[amountCol]);
    candidates.push({
      stableId,
      row: i + 2,
      companyName: (row[companyCol] ?? "").trim(),
      vehicleName: (row[vehicleCol] ?? "").trim(),
      investmentType,
      dateKey: dateKey(date),
      amount: amount.ok ? amount.value : null,
    });
  });
  return candidates;
}

interface MatchResult {
  dealId: string;
  company: string;
  vehicle: string;
  stableId: string | null;
  status: "matched" | "ambiguous" | "unmatched" | "skipped-already-linked";
  detail?: string;
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (!sheetsSyncEnabled()) {
    console.error("GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY / SHEETS_SPREADSHEET_ID must all be set.");
    process.exit(1);
  }

  const db = new PrismaClient();
  try {
    const candidates = await loadSheetCandidates();
    const byKey = new Map<string, SheetCandidate[]>();
    for (const c of candidates) {
      const key = contentKey(c.companyName, c.vehicleName, c.investmentType, c.dateKey);
      const list = byKey.get(key) ?? [];
      list.push(c);
      byKey.set(key, list);
    }

    const deals = await db.deal.findMany({
      include: { portfolioCompany: { select: { name: true } }, fund: { select: { name: true } } },
      orderBy: { dealDate: "asc" },
    });

    const results: MatchResult[] = [];
    const usedStableIds = new Set<string>();

    for (const deal of deals) {
      if (deal.sheetRowId) {
        results.push({ dealId: deal.id, company: deal.portfolioCompany.name, vehicle: deal.fund.name, stableId: deal.sheetRowId, status: "skipped-already-linked" });
        continue;
      }
      const key = contentKey(deal.portfolioCompany.name, deal.fund.name, deal.investmentType, dateKey(deal.dealDate));
      let group = byKey.get(key) ?? [];

      if (group.length > 1) {
        // Tiebreak on amount.
        const amt = Number(deal.amountUsd);
        const narrowed = group.filter((c) => c.amount !== null && Math.abs(c.amount - amt) < 0.5);
        if (narrowed.length === 1) group = narrowed;
      }

      if (group.length === 0) {
        results.push({ dealId: deal.id, company: deal.portfolioCompany.name, vehicle: deal.fund.name, stableId: null, status: "unmatched", detail: "no sheet row with matching company/vehicle/type/date" });
      } else if (group.length > 1) {
        results.push({
          dealId: deal.id,
          company: deal.portfolioCompany.name,
          vehicle: deal.fund.name,
          stableId: null,
          status: "ambiguous",
          detail: `${group.length} candidate sheet rows: ${group.map((c) => c.stableId).join(", ")}`,
        });
      } else {
        const candidate = group[0];
        if (usedStableIds.has(candidate.stableId)) {
          results.push({ dealId: deal.id, company: deal.portfolioCompany.name, vehicle: deal.fund.name, stableId: null, status: "ambiguous", detail: `stable ID ${candidate.stableId} already claimed by another deal` });
        } else {
          usedStableIds.add(candidate.stableId);
          results.push({ dealId: deal.id, company: deal.portfolioCompany.name, vehicle: deal.fund.name, stableId: candidate.stableId, status: "matched" });
        }
      }
    }

    const matched = results.filter((r) => r.status === "matched");
    const alreadyLinked = results.filter((r) => r.status === "skipped-already-linked");
    const ambiguous = results.filter((r) => r.status === "ambiguous");
    const unmatched = results.filter((r) => r.status === "unmatched");

    console.log("─── Sheet-row linking report ───────────────────────────");
    console.log(`Total deals: ${deals.length}`);
    console.log(`Already linked (idempotent skip): ${alreadyLinked.length}`);
    console.log(`Confidently matched: ${matched.length}`);
    console.log(`Ambiguous (need human review): ${ambiguous.length}`);
    console.log(`Unmatched (need human review): ${unmatched.length}`);
    if (ambiguous.length > 0) {
      console.log("\nAmbiguous:");
      for (const r of ambiguous) console.log(`  ${r.company} / ${r.vehicle} (deal ${r.dealId}) — ${r.detail}`);
    }
    if (unmatched.length > 0) {
      console.log("\nUnmatched:");
      for (const r of unmatched) console.log(`  ${r.company} / ${r.vehicle} (deal ${r.dealId}) — ${r.detail}`);
    }

    if (!apply) {
      console.log("\nDry run only — nothing written. Re-run with --apply once this report is clean (0 ambiguous, 0 unmatched).");
      return;
    }

    if (ambiguous.length > 0 || unmatched.length > 0) {
      console.error("\nRefusing to --apply: ambiguous/unmatched entries remain. Fix the data and re-run dry-run until clean.");
      process.exit(1);
    }

    for (const r of matched) {
      await db.deal.update({ where: { id: r.dealId }, data: { sheetRowId: r.stableId } });
    }
    console.log(`\nApplied: wrote sheetRowId on ${matched.length} deal(s).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
