// Part 10, WS27.4 — the DB-touching half of the one-way Google Sheets sync
// (Q22-B). Deliberately kept separate from sheet-sync.ts, which stays pure
// and Prisma-free (plain TS interfaces, unit-tested on synthetic rows).
// This file wires that pure diff engine to `db`, `getSheetRows()`, and
// `logAdminAction` — it is the shared implementation behind both the
// weekly cron route and the manual "Sync now" / "Preview" admin route.
//
// CONFIDENTIALITY: SheetSyncRun.summary carries real valuations/company
// names — never console.log it. Only aggregate counts go to stdout/stderr
// (the existing cron logging convention, e.g. api/cron/alerts/route.ts).

import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/audit";
import { getSheetRows, sheetsSyncEnabled } from "@/lib/sheets";
import { computeSheetDiff, type SheetDiff, type DbDealForSync, type KnownFund, type KnownCompany } from "@/lib/sheet-sync";

export type SyncTrigger = "CRON" | "MANUAL" | "DRY_RUN";

export interface SheetSyncSummary {
  dealsCreated: number;
  companiesCreated: number;
  fieldsUpdated: number;
  marksCreated: number;
  errors: SheetDiff["errors"];
  // Present only for a stored preview/history detail — never logged.
  diff?: SheetDiff;
}

export interface SheetSyncResult {
  runId: string;
  trigger: SyncTrigger;
  status: "SUCCESS" | "FAILED";
  summary: SheetSyncSummary | null;
  error: string | null;
}

const SHEET_OWNED_FIELDS = new Set(["investmentType", "dealDate", "amountUsd", "instrument", "entryValuation", "notes"]);

async function loadSyncInputs(): Promise<{ dbDeals: DbDealForSync[]; knownFunds: KnownFund[]; knownCompanies: KnownCompany[] }> {
  const [deals, funds, companies] = await Promise.all([
    db.deal.findMany({
      select: {
        id: true,
        sheetRowId: true,
        investmentType: true,
        dealDate: true,
        country: true,
        amountUsd: true,
        instrument: true,
        entryValuation: true,
        currentValuation: true,
        notes: true,
      },
    }),
    db.fund.findMany({ select: { id: true, name: true } }),
    db.portfolioCompany.findMany({ select: { id: true, name: true } }),
  ]);
  const dbDeals: DbDealForSync[] = deals.map((d) => ({
    id: d.id,
    sheetRowId: d.sheetRowId,
    investmentType: d.investmentType,
    dealDate: d.dealDate,
    country: d.country,
    amountUsd: Number(d.amountUsd),
    instrument: d.instrument,
    entryValuation: d.entryValuation !== null ? Number(d.entryValuation) : null,
    currentValuation: d.currentValuation !== null ? Number(d.currentValuation) : null,
    notes: d.notes,
  }));
  return { dbDeals, knownFunds: funds, knownCompanies: companies };
}

/**
 * Applies a computed diff (JC19: never destructive — only creates/updates,
 * never deletes, never invents a fund). Groups `currentValuation` changes
 * by portfolio company and writes them as a single `ValuationMark {
 * source: "SHEET" }` per company, fanned out to every deal of that company
 * — the same effect a manual mark (WS25.1) has, so published report hover
 * cards/snapshots stay byte-identical (JC16, ground rule 2).
 */
async function applySheetDiff(
  diff: SheetDiff,
  actor: { id?: string; email?: string | null }
): Promise<{ dealsCreated: number; companiesCreated: number; fieldsUpdated: number; marksCreated: number }> {
  let dealsCreated = 0;
  let companiesCreated = 0;
  let fieldsUpdated = 0;
  let marksCreated = 0;

  // Reuse one newly-created PortfolioCompany id across every create that
  // references the same brand-new company name in this run.
  const newCompanyIdByName = new Map<string, string>();

  for (const create of diff.creates) {
    let portfolioCompanyId = create.portfolioCompanyId;
    if (!portfolioCompanyId) {
      const cached = newCompanyIdByName.get(create.companyName);
      if (cached) {
        portfolioCompanyId = cached;
      } else {
        const company = await db.portfolioCompany.upsert({
          where: { name: create.companyName },
          create: { name: create.companyName, country: create.country },
          update: {},
        });
        newCompanyIdByName.set(create.companyName, company.id);
        portfolioCompanyId = company.id;
        companiesCreated++;
      }
    }

    const deal = await db.deal.create({
      data: {
        fundId: create.fundId,
        portfolioCompanyId,
        sheetRowId: create.sheetRowId,
        investmentType: create.investmentType,
        dealDate: create.dealDate,
        country: create.country,
        amountUsd: create.amountUsd,
        instrument: create.instrument,
        entryValuation: create.entryValuation,
        currentValuation: create.currentValuation,
        valuationAsOf: create.currentValuation !== null ? new Date() : null,
        notes: create.notes,
      },
    });
    dealsCreated++;
    await logAdminAction(actor, "DEAL_CREATED", {
      targetType: "Deal",
      targetId: deal.id,
      metadata: { source: "SHEET", sheetRowId: create.sheetRowId },
    });
  }

  // Non-valuation field updates: applied directly, per deal.
  const nonValuationUpdates = diff.updates.filter((u) => SHEET_OWNED_FIELDS.has(u.field));
  const byDeal = new Map<string, typeof nonValuationUpdates>();
  for (const u of nonValuationUpdates) {
    const list = byDeal.get(u.dealId) ?? [];
    list.push(u);
    byDeal.set(u.dealId, list);
  }
  for (const [dealId, updates] of byDeal) {
    const data: Record<string, unknown> = {};
    for (const u of updates) data[u.field] = u.to;
    await db.deal.update({ where: { id: dealId }, data });
    fieldsUpdated += updates.length;
    await logAdminAction(actor, "DEAL_UPDATED", {
      targetType: "Deal",
      targetId: dealId,
      metadata: { source: "SHEET", fields: updates.map((u) => u.field) },
    });
  }

  // currentValuation updates: grouped by company, written as a mark + fan-out (JC16).
  const valuationUpdates = diff.updates.filter((u) => u.field === "currentValuation");
  if (valuationUpdates.length > 0) {
    const dealIds = valuationUpdates.map((u) => u.dealId);
    const deals = await db.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, portfolioCompanyId: true } });
    const companyByDeal = new Map(deals.map((d) => [d.id, d.portfolioCompanyId]));

    // Last-write-wins per company when a run touches more than one of its
    // deals in the same pass (expected: the sheet repeats a company's
    // current valuation on every row for that company).
    const latestByCompany = new Map<string, { valuationUsd: number; dealId: string }>();
    for (const u of valuationUpdates) {
      const companyId = companyByDeal.get(u.dealId);
      if (!companyId || typeof u.to !== "number") continue;
      latestByCompany.set(companyId, { valuationUsd: u.to, dealId: u.dealId });
    }

    for (const [companyId, { valuationUsd }] of latestByCompany) {
      const asOf = new Date();
      const mark = await db.$transaction(async (tx) => {
        const created = await tx.valuationMark.create({
          data: { portfolioCompanyId: companyId, valuationUsd, asOf, source: "SHEET" },
        });
        await tx.deal.updateMany({ where: { portfolioCompanyId: companyId }, data: { currentValuation: valuationUsd, valuationAsOf: asOf } });
        return created;
      });
      marksCreated++;
      fieldsUpdated += 1;
      await logAdminAction(actor, "MARK_CREATED", {
        targetType: "ValuationMark",
        targetId: mark.id,
        metadata: { portfolioCompanyId: companyId, newValuation: valuationUsd, source: "SHEET" },
      });
    }
  }

  return { dealsCreated, companiesCreated, fieldsUpdated, marksCreated };
}

/**
 * Runs (or previews) one sync pass. `sheetsSyncEnabled()` must be checked
 * by the caller first (routes no-op cleanly when it's false — ground rule
 * 4); this function assumes it's already true.
 */
export async function runSheetSync(trigger: SyncTrigger, actor: { id?: string; email?: string | null }): Promise<SheetSyncResult> {
  const startedAt = new Date();
  try {
    const sheet = await getSheetRows();
    const { dbDeals, knownFunds, knownCompanies } = await loadSyncInputs();
    const diff = computeSheetDiff(sheet, dbDeals, knownFunds, knownCompanies);

    let applied = { dealsCreated: 0, companiesCreated: 0, fieldsUpdated: 0, marksCreated: 0 };
    if (trigger !== "DRY_RUN") {
      applied = await applySheetDiff(diff, actor);
    }

    const summary: SheetSyncSummary = { ...applied, errors: diff.errors, diff };
    const run = await db.sheetSyncRun.create({
      data: {
        trigger,
        status: "SUCCESS",
        startedAt,
        finishedAt: new Date(),
        summary: summary as unknown as object,
      },
    });
    return { runId: run.id, trigger, status: "SUCCESS", summary, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    const run = await db.sheetSyncRun.create({
      data: { trigger, status: "FAILED", startedAt, finishedAt: new Date(), error: message },
    });
    return { runId: run.id, trigger, status: "FAILED", summary: null, error: message };
  }
}

export { sheetsSyncEnabled };
