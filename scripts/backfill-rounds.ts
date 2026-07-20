/**
 * Portfolio ledger backfill (Part 10, WS24.2): synthesizes one
 * FinancingRound per existing Deal (JC17 — no grouping, "UNKNOWN" kind,
 * source: "BACKFILL") and one ValuationMark per PortfolioCompany, then
 * links each backfilled deal to its round via Deal.roundId.
 *
 * Unlike scripts/import-investment-tracker.ts, there is no external source
 * file here — Molly's own `deals`/`portfolio_companies` tables ARE the
 * source, so even the dry run needs a DB connection (a read-only one).
 *
 * CONFIDENTIALITY: reads real deal amounts/valuations from prod. Dry-run
 * output prints real numbers to the terminal only — never paste it into a
 * commit, PR body, or issue.
 *
 * Idempotent apply: a deal with `roundId` already set is skipped; a company
 * that already has any ValuationMark is skipped for mark creation. Re-running
 * --apply after a clean run should report "0 to do" everywhere.
 *
 * Usage:
 *   # dry run (default) — reads, reports counts + a disagreement list; writes nothing
 *   DATABASE_URL="<from the pulled prod env>" npx tsx scripts/backfill-rounds.ts
 *
 *   # apply — creates FinancingRound + ValuationMark rows, sets Deal.roundId
 *   DATABASE_URL="<...>" npx tsx scripts/backfill-rounds.ts --apply
 *
 *   # revert — deletes source: "BACKFILL" rounds/marks and nulls the deal
 *   # pointers; refuses if a BACKFILL round has acquired a non-backfill
 *   # reference (e.g. a manually-set convertedInRoundId) since reverting
 *   # would destroy human work. This is the reversibility escape hatch —
 *   # run it against a LOCAL/BRANCH DB copy, never against prod.
 *   DATABASE_URL="<...>" npx tsx scripts/backfill-rounds.ts --revert
 */
import { PrismaClient, type Deal } from "@prisma/client";

const EXPECTED_DEAL_COUNT = 76; // informational only — prod may have grown since Part 7's import; see the printed note if it has

function decNum(d: unknown): number | null {
  return d === null || d === undefined ? null : Number(d);
}

/** The company's most-recently-valued deal: latest valuationAsOf, ties broken by latest dealDate. */
function pickValuationSource(deals: Deal[]): Deal | null {
  const withVal = deals.filter((d) => d.currentValuation !== null);
  if (withVal.length === 0) return null;
  const sorted = [...withVal].sort((a, b) => {
    const aAsOf = a.valuationAsOf?.getTime() ?? 0;
    const bAsOf = b.valuationAsOf?.getTime() ?? 0;
    if (aAsOf !== bAsOf) return bAsOf - aAsOf;
    return b.dealDate.getTime() - a.dealDate.getTime();
  });
  return sorted[0];
}

/** Do this company's deals disagree on currentValuation (more than one distinct non-null value)? */
function hasDisagreement(deals: Deal[]): string[] {
  const vals = new Set(
    deals.filter((d) => d.currentValuation !== null).map((d) => decNum(d.currentValuation)!.toString())
  );
  return vals.size > 1 ? [...vals] : [];
}

// ─── Dry run ─────────────────────────────────────────────────

async function dryRun(db: PrismaClient) {
  const companies = await db.portfolioCompany.findMany({ include: { deals: true } });
  const allDeals = companies.flatMap((c) => c.deals);

  const roundsToCreate = allDeals.filter((d) => !d.roundId).length;
  const roundsAlreadyLinked = allDeals.length - roundsToCreate;

  let marksToCreate = 0;
  let companiesAlreadyMarked = 0;
  let companiesWithNoValuation = 0;
  const disagreements: { company: string; values: string[] }[] = [];

  for (const company of companies) {
    const existingMark = await db.valuationMark.findFirst({ where: { portfolioCompanyId: company.id } });
    if (existingMark) {
      companiesAlreadyMarked++;
      continue;
    }
    const source = pickValuationSource(company.deals);
    if (!source) {
      companiesWithNoValuation++;
      continue;
    }
    marksToCreate++;
    const dis = hasDisagreement(company.deals);
    if (dis.length > 0) disagreements.push({ company: company.name, values: dis });
  }

  console.log("─── Backfill dry-run report ───────────────────────────");
  console.log(`Total deals: ${allDeals.length} (expected ${EXPECTED_DEAL_COUNT}${allDeals.length !== EXPECTED_DEAL_COUNT ? " — MISMATCH, review before proceeding" : ""})`);
  console.log(`Total portfolio companies: ${companies.length}`);
  console.log("");
  console.log(`Rounds to create: ${roundsToCreate} (one per deal, JC17)`);
  console.log(`Deals already linked to a round (idempotent skip): ${roundsAlreadyLinked}`);
  console.log("");
  console.log(`Valuation marks to create: ${marksToCreate}`);
  console.log(`Companies already marked (idempotent skip): ${companiesAlreadyMarked}`);
  console.log(`Companies with no non-null currentValuation on any deal (no mark possible): ${companiesWithNoValuation}`);
  console.log("");
  console.log(`Companies whose deals disagree on currentValuation, flagged for human review: ${disagreements.length}`);
  for (const d of disagreements) {
    console.log(`  ${d.company} — distinct currentValuation values seen: ${d.values.join(", ")}`);
  }
  console.log("");
  console.log("Dry run only — nothing written.");
  console.log('Re-run with --apply (DATABASE_URL set explicitly) to write.');
}

// ─── Apply ───────────────────────────────────────────────────

async function apply(db: PrismaClient) {
  const companies = await db.portfolioCompany.findMany({ include: { deals: true } });

  let roundsCreated = 0;
  let dealsSkipped = 0;
  let marksCreated = 0;
  let companiesSkipped = 0;
  const disagreements: { company: string; values: string[] }[] = [];

  for (const company of companies) {
    for (const deal of company.deals) {
      if (deal.roundId) {
        dealsSkipped++;
        continue;
      }
      const round = await db.financingRound.create({
        data: {
          portfolioCompanyId: company.id,
          roundDate: deal.dealDate,
          postMoneyUsd: deal.entryValuation ?? undefined,
          label: deal.instrument ?? undefined,
          kind: "UNKNOWN",
          source: "BACKFILL",
        },
      });
      await db.deal.update({ where: { id: deal.id }, data: { roundId: round.id } });
      roundsCreated++;
    }

    const dis = hasDisagreement(company.deals);
    if (dis.length > 0) disagreements.push({ company: company.name, values: dis });

    const existingMark = await db.valuationMark.findFirst({ where: { portfolioCompanyId: company.id } });
    if (existingMark) {
      companiesSkipped++;
      continue;
    }
    const source = pickValuationSource(company.deals);
    if (!source) continue;
    await db.valuationMark.create({
      data: {
        portfolioCompanyId: company.id,
        valuationUsd: source.currentValuation!,
        asOf: source.valuationAsOf ?? source.dealDate,
        source: "BACKFILL",
      },
    });
    marksCreated++;
  }

  console.log("─── Backfill apply summary ─────────────────────────────");
  console.log(`Rounds created: ${roundsCreated}`);
  console.log(`Deals already linked (skipped, idempotent): ${dealsSkipped}`);
  console.log(`Valuation marks created: ${marksCreated}`);
  console.log(`Companies already marked (skipped, idempotent): ${companiesSkipped}`);
  console.log(`Companies whose deals disagreed on currentValuation (mark still created from the most-recent deal): ${disagreements.length}`);
  for (const d of disagreements) {
    console.log(`  ${d.company} — distinct currentValuation values seen: ${d.values.join(", ")}`);
  }
}

// ─── Revert (local/branch DB only — never prod) ───────────────

async function revert(db: PrismaClient) {
  const backfillRounds = await db.financingRound.findMany({
    where: { source: "BACKFILL" },
    include: { conversions: true },
  });

  const blocked = backfillRounds.filter((r) => r.conversions.length > 0);
  if (blocked.length > 0) {
    console.error("REFUSING to revert: the following BACKFILL rounds have acquired non-backfill references (a deal's convertedInRoundId points at them) — reverting would destroy human work:");
    for (const r of blocked) {
      console.error(`  round ${r.id} (company ${r.portfolioCompanyId}) — ${r.conversions.length} conversion reference(s)`);
    }
    process.exit(1);
  }

  const roundIds = backfillRounds.map((r) => r.id);
  if (roundIds.length === 0) {
    console.log("No BACKFILL rounds found — nothing to revert.");
    return;
  }

  const dealsUnlinked = await db.deal.updateMany({ where: { roundId: { in: roundIds } }, data: { roundId: null } });
  await db.deal.updateMany({ where: { convertedInRoundId: { in: roundIds } }, data: { convertedInRoundId: null } });
  const roundsDeleted = await db.financingRound.deleteMany({ where: { id: { in: roundIds } } });
  const marksDeleted = await db.valuationMark.deleteMany({ where: { source: "BACKFILL" } });

  console.log("─── Revert summary ─────────────────────────────────────");
  console.log(`Deals unlinked (roundId nulled): ${dealsUnlinked.count}`);
  console.log(`Rounds deleted: ${roundsDeleted.count}`);
  console.log(`Marks deleted: ${marksDeleted.count}`);
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const doApply = args.includes("--apply");
  const doRevert = args.includes("--revert");

  if (doApply && doRevert) {
    console.error("HARD FAIL: pass only one of --apply or --revert.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("HARD FAIL: DATABASE_URL must be set explicitly (no ambient fallback) — this script always connects to read live deal data, even for a dry run.");
    process.exit(1);
  }

  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    if (doRevert) {
      await revert(db);
    } else if (doApply) {
      await apply(db);
    } else {
      await dryRun(db);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
