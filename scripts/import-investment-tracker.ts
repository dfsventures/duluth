/**
 * One-time importer: DFS Lab Investment Tracker (xlsx) -> Molly's LP
 * Fund-Report Portal tables (funds, portfolio_companies, deals). WS16.
 *
 * CONFIDENTIALITY: the source spreadsheet and everything derived from it
 * (company names, deal amounts, valuations) must never enter this
 * repository. This script takes the xlsx path as a CLI argument pointing
 * OUTSIDE the repo tree; nothing it reads is written to any file here.
 * Dry-run output prints real numbers to the terminal only — never paste
 * it into a commit, PR body, or issue.
 *
 * Source: the "Deals" sheet ONLY (a clean flat table). The "IRR Calc"
 * sheet is never read — its standalone single-vehicle block is stale
 * (missing every 2025-26 deal) and its ALL-aggregate block has valuation
 * cells corrupted by date-formatted numbers. See docs/IMPLEMENTATION_PLAN.md
 * Part 7, finding F17, for the full verification.
 *
 * Usage:
 *   # dry run (default) — parses, validates, prints the report; writes nothing
 *   npx tsx scripts/import-investment-tracker.ts <path-to-xlsx> [--vehicles=A,B,C]
 *
 *   # real run against prod (env pulled per the house `vercel env pull
 *   # --environment=production` procedure; delete the pulled file after)
 *   DATABASE_URL="<from the pulled env>" npx tsx scripts/import-investment-tracker.ts <path> --vehicles=A,B,C --write
 *
 * --vehicles=<comma-separated slugs> — the expected fund-vehicle set for this
 * deployment. Vehicle slugs are deployment-specific data and must never be
 * committed (see the Confidentiality & synthetic-data convention at the top
 * of docs/IMPLEMENTATION_PLAN.md) — pass DFS's real slugs at run time only.
 * Omitting the flag falls back to a generic illustrative default, which will
 * not match any real spreadsheet and will trip the drift guard below.
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

// Vehicle slugs are deployment-specific data — never commit the real set.
// Pass them at run time:  tsx import-investment-tracker.ts <path.xlsx> --vehicles=A,B,C
const DEFAULT_VEHICLES = ["FUND1", "FUND2", "FUND3", "MISC"] as const; // illustrative only
const vehArg = process.argv.find((a) => a.startsWith("--vehicles="));
const KNOWN_VEHICLES: string[] = vehArg
  ? vehArg
      .slice("--vehicles=".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [...DEFAULT_VEHICLES];
type VehicleSlug = string;

const EXPECTED_DEAL_COUNT = 76;
const EXPECTED_COMPANY_COUNT = 50;

interface RawDeal {
  row: number; // 1-indexed spreadsheet row, for error messages
  company: string;
  vehicle: string;
  investmentType: "INITIAL" | "FOLLOW_ON";
  dealDate: Date;
  country: string | null;
  amountUsd: number;
  instrument: string | null;
  entryValuation: number | null;
  currentValuation: number | null;
  notes: string | null;
}

interface SkippedRow {
  row: number;
  reason: string;
}

interface FundMeta {
  slug: VehicleSlug;
  groupLabel: string | null;
  firstDealDate: Date | null;
  deployedUsd: number | null; // checksum only — never stored
  aumUsd: number | null;
}

// ─── Spreadsheet helpers ────────────────────────────────────

function cellAddr(r0: number, c0: number): string {
  return XLSX.utils.encode_cell({ r: r0, c: c0 });
}

function cellValue(sheet: XLSX.WorkSheet, r0: number, c0: number): unknown {
  return sheet[cellAddr(r0, c0)]?.v ?? null;
}

/** Resolve a cell's value, following a merged range to its top-left anchor. */
function resolvedValue(sheet: XLSX.WorkSheet, r0: number, c0: number): unknown {
  const merges = sheet["!merges"] ?? [];
  for (const m of merges) {
    if (r0 >= m.s.r && r0 <= m.e.r && c0 >= m.s.c && c0 <= m.e.c) {
      return cellValue(sheet, m.s.r, m.s.c);
    }
  }
  return cellValue(sheet, r0, c0);
}

/** Find the "Company" header cell in column C — scan, don't hardcode the row. */
function findHeaderRow0(sheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let r0 = range.s.r; r0 <= range.e.r; r0++) {
    const v = cellValue(sheet, r0, 2); // column C
    if (typeof v === "string" && v.trim() === "Company") return r0;
  }
  throw new Error('Could not find the "Company" header in column C of the Deals sheet.');
}

/**
 * Find the row carrying the vehicle-slug column headers (the slugs passed
 * via --vehicles, e.g. FUND1, FUND2, ...) above the deal table. The
 * implementation briefing claimed these live in columns B-H; the live file
 * actually has them in D-J (verified 2026-07-08) — so this scans for the
 * known slugs rather than trusting either set of hardcoded letters.
 */
function findVehicleColumns(sheet: XLSX.WorkSheet, beforeRow0: number): { row0: number; cols: Record<VehicleSlug, number> } {
  for (let r0 = 0; r0 < beforeRow0; r0++) {
    const cols: Partial<Record<VehicleSlug, number>> = {};
    for (let c0 = 0; c0 < 40; c0++) {
      const v = cellValue(sheet, r0, c0);
      if (typeof v === "string" && KNOWN_VEHICLES.includes(v.trim())) {
        cols[v.trim() as VehicleSlug] = c0;
      }
    }
    if (Object.keys(cols).length >= 5) return { row0: r0, cols: cols as Record<VehicleSlug, number> };
  }
  throw new Error("Could not find the vehicle-slug header row (expected the slugs passed via --vehicles).");
}

/** Find a metadata row by its label in column A-D, within [fromRow0, toRow0]. */
function findLabeledRow0(sheet: XLSX.WorkSheet, label: string, fromRow0: number, toRow0: number): number | null {
  for (let r0 = fromRow0; r0 <= toRow0; r0++) {
    for (let c0 = 0; c0 < 4; c0++) {
      const v = cellValue(sheet, r0, c0);
      if (typeof v === "string" && v.trim() === label) return r0;
    }
  }
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function toStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
}

// ─── Parsing ─────────────────────────────────────────────────

function parseWorkbook(path: string): { deals: RawDeal[]; funds: FundMeta[]; skipped: SkippedRow[] } {
  const workbook = XLSX.readFile(path, { cellDates: true });
  const sheet = workbook.Sheets["Deals"];
  if (!sheet) throw new Error('Workbook has no "Deals" sheet.');

  const headerRow0 = findHeaderRow0(sheet);
  const { row0: vehicleRow0, cols: vehicleCols } = findVehicleColumns(sheet, headerRow0);
  const groupLabelRow0 = vehicleRow0 - 1 >= 0 ? vehicleRow0 - 1 : null;
  const firstDealDateRow0 = findLabeledRow0(sheet, "First Deal Date", vehicleRow0, headerRow0);
  const deployedRow0 = findLabeledRow0(sheet, "Deployed", vehicleRow0, headerRow0);
  const aumRow0 = findLabeledRow0(sheet, "AUM", vehicleRow0, headerRow0);

  const funds: FundMeta[] = KNOWN_VEHICLES.map((slug) => {
    const c0 = vehicleCols[slug];
    const groupLabel =
      groupLabelRow0 !== null && c0 !== undefined ? toStr(resolvedValue(sheet, groupLabelRow0, c0)) : null;
    const firstDealDateRaw = firstDealDateRow0 !== null && c0 !== undefined ? cellValue(sheet, firstDealDateRow0, c0) : null;
    const deployedUsd = deployedRow0 !== null && c0 !== undefined ? toNumber(cellValue(sheet, deployedRow0, c0)) : null;
    const aumUsd = aumRow0 !== null && c0 !== undefined ? toNumber(cellValue(sheet, aumRow0, c0)) : null;
    return {
      slug,
      groupLabel,
      firstDealDate: firstDealDateRaw instanceof Date ? firstDealDateRaw : null,
      deployedUsd,
      aumUsd,
    };
  });

  // Deal rows: header + 1 through the first row whose Company cell (col C)
  // is not a non-empty string.
  const deals: RawDeal[] = [];
  const skipped: SkippedRow[] = [];
  let r0 = headerRow0 + 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const companyRaw = cellValue(sheet, r0, 2); // C
    if (typeof companyRaw !== "string" || companyRaw.trim() === "") break;

    const rowNum = r0 + 1; // 1-indexed for messages
    const company = companyRaw.trim();
    const vehicle = toStr(cellValue(sheet, r0, 3)); // D
    const investmentRaw = toStr(cellValue(sheet, r0, 4)); // E
    const dealDateRaw = cellValue(sheet, r0, 5); // F
    const country = toStr(cellValue(sheet, r0, 6)); // G
    const amountUsd = toNumber(cellValue(sheet, r0, 7)); // H
    const instrument = toStr(cellValue(sheet, r0, 8)); // I
    const entryValuation = toNumber(cellValue(sheet, r0, 9)); // J
    const currentValuation = toNumber(cellValue(sheet, r0, 10)); // K
    // L (Markups) and M (Implied Value) are derived — skipped
    const notes = toStr(cellValue(sheet, r0, 13)); // N

    const investmentType = investmentRaw === "Initial" ? "INITIAL" : investmentRaw === "Follow-On" ? "FOLLOW_ON" : null;

    if (!vehicle || !KNOWN_VEHICLES.includes(vehicle)) {
      skipped.push({ row: rowNum, reason: `Unrecognized vehicle "${vehicle}"` });
      r0++;
      continue;
    }
    if (!investmentType) {
      skipped.push({ row: rowNum, reason: `Unrecognized investment type "${investmentRaw}"` });
      r0++;
      continue;
    }
    if (!(dealDateRaw instanceof Date)) {
      skipped.push({ row: rowNum, reason: "Missing/unparseable deal date" });
      r0++;
      continue;
    }
    if (amountUsd === null || amountUsd <= 0) {
      skipped.push({ row: rowNum, reason: `Missing/invalid amount "${amountUsd}"` });
      r0++;
      continue;
    }

    deals.push({
      row: rowNum,
      company,
      vehicle,
      investmentType,
      dealDate: dealDateRaw,
      country,
      amountUsd,
      instrument,
      entryValuation,
      currentValuation,
      notes,
    });
    r0++;
  }

  return { deals, funds, skipped };
}

// ─── Report ──────────────────────────────────────────────────

function buildReport(deals: RawDeal[], funds: FundMeta[], skipped: SkippedRow[]) {
  const byFund = new Map<string, RawDeal[]>();
  for (const d of deals) {
    byFund.set(d.vehicle, [...(byFund.get(d.vehicle) ?? []), d]);
  }

  const companies = new Set(deals.map((d) => d.company));

  console.log("─── Import dry-run report ───────────────────────────");
  console.log(`Total deals parsed: ${deals.length} (expected ${EXPECTED_DEAL_COUNT})`);
  console.log(`Distinct companies: ${companies.size} (expected ${EXPECTED_COMPANY_COUNT})`);
  console.log(`Vehicles seen: ${[...byFund.keys()].sort().join(", ")}`);
  console.log("");

  console.log("Per-fund deal/company counts + invested-total checksum vs. sheet's Deployed row:");
  for (const meta of funds) {
    const fundDeals = byFund.get(meta.slug) ?? [];
    const invested = fundDeals.reduce((sum, d) => sum + d.amountUsd, 0);
    const fundCompanies = new Set(fundDeals.map((d) => d.company)).size;
    const checksumOk = meta.deployedUsd === null || Math.abs(invested - meta.deployedUsd) < 1;
    console.log(
      `  ${meta.slug.padEnd(9)} deals=${String(fundDeals.length).padStart(2)}  companies=${String(fundCompanies).padStart(2)}  ` +
        `invested=$${invested.toLocaleString()}  sheetDeployed=$${(meta.deployedUsd ?? 0).toLocaleString()}  ` +
        `checksum=${checksumOk ? "OK" : "MISMATCH"}  groupLabel=${meta.groupLabel ?? "(none)"}  aum=$${(meta.aumUsd ?? 0).toLocaleString()}`
    );
  }
  console.log("");

  // Near-duplicate detection: same (company, vehicle, investmentType) appearing
  // more than once (e.g. Northstar/Southgate's double-Initial rows). Not an error —
  // the schema has no uniqueness constraint here on purpose — but worth a
  // human eyeball before writing.
  const dupKey = (d: RawDeal) => `${d.company}::${d.vehicle}::${d.investmentType}`;
  const groups = new Map<string, RawDeal[]>();
  for (const d of deals) groups.set(dupKey(d), [...(groups.get(dupKey(d)) ?? []), d]);
  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`Near-duplicate (company, fund, type) groups flagged for human review: ${duplicateGroups.length}`);
  for (const g of duplicateGroups) {
    console.log(
      `  ${g[0].company} / ${g[0].vehicle} / ${g[0].investmentType} — rows ${g.map((d) => d.row).join(", ")} — dates ${g
        .map((d) => d.dealDate.toISOString().slice(0, 10))
        .join(", ")}`
    );
  }
  console.log("");

  if (skipped.length > 0) {
    console.log(`Skipped rows: ${skipped.length}`);
    for (const s of skipped) console.log(`  row ${s.row}: ${s.reason}`);
  } else {
    console.log("Skipped rows: 0");
  }
  console.log("");

  return { byFund, companies, duplicateGroups };
}

// ─── Company matching (Q14 — auto-link only unambiguous exact matches) ──

async function matchCompanies(db: PrismaClient, portfolioCompanyNames: string[]) {
  const mollyCompanies = await db.company.findMany({ select: { id: true, name: true, aliases: true } });

  // lowercased name/alias -> list of candidate Molly company ids
  const index = new Map<string, string[]>();
  for (const c of mollyCompanies) {
    const keys = [c.name, ...c.aliases].map((k) => k.toLowerCase().trim());
    for (const k of keys) {
      index.set(k, [...(index.get(k) ?? []), c.id]);
    }
  }

  const matches = new Map<string, { companyId: string; companyName: string } | { candidates: string[] } | null>();
  for (const name of portfolioCompanyNames) {
    const ids = [...new Set(index.get(name.toLowerCase().trim()) ?? [])];
    if (ids.length === 1) {
      const molly = mollyCompanies.find((c) => c.id === ids[0])!;
      matches.set(name, { companyId: molly.id, companyName: molly.name });
    } else if (ids.length > 1) {
      matches.set(name, { candidates: ids });
    } else {
      matches.set(name, null);
    }
  }
  return matches;
}

// ─── Write path ──────────────────────────────────────────────

async function writeImport(
  db: PrismaClient,
  deals: RawDeal[],
  funds: FundMeta[],
  companyMatches: Map<string, { companyId: string; companyName: string } | { candidates: string[] } | null>
) {
  const importedAt = new Date();
  let fundsUpserted = 0;
  let companiesUpserted = 0;
  let dealsCreated = 0;
  let dealsSkippedExisting = 0;

  const fundIdBySlug = new Map<string, string>();
  for (const meta of funds) {
    const fund = await db.fund.upsert({
      where: { slug: meta.slug },
      update: {
        groupLabel: meta.groupLabel ?? undefined,
        firstDealDate: meta.firstDealDate ?? undefined,
        aumUsd: meta.aumUsd ?? undefined,
      },
      create: {
        slug: meta.slug,
        name: meta.slug,
        groupLabel: meta.groupLabel,
        firstDealDate: meta.firstDealDate,
        aumUsd: meta.aumUsd,
        sortOrder: KNOWN_VEHICLES.indexOf(meta.slug),
      },
    });
    fundIdBySlug.set(meta.slug, fund.id);
    fundsUpserted++;
  }

  const portfolioCompanyIdByName = new Map<string, string>();
  const companyNames = [...new Set(deals.map((d) => d.company))];
  for (const name of companyNames) {
    const match = companyMatches.get(name);
    const companyId = match && "companyId" in match ? match.companyId : null;
    const existing = await db.portfolioCompany.findUnique({ where: { name } });
    const pc = existing
      ? existing
      : await db.portfolioCompany.create({
          data: { name, country: deals.find((d) => d.company === name)?.country ?? null, companyId },
        });
    portfolioCompanyIdByName.set(name, pc.id);
    companiesUpserted++;
  }

  for (const d of deals) {
    const fundId = fundIdBySlug.get(d.vehicle);
    const portfolioCompanyId = portfolioCompanyIdByName.get(d.company);
    if (!fundId || !portfolioCompanyId) continue; // unreachable given parse validation, but keep TS happy

    const existing = await db.deal.findFirst({
      where: {
        fundId,
        portfolioCompanyId,
        investmentType: d.investmentType,
        dealDate: d.dealDate,
        amountUsd: d.amountUsd,
      },
    });
    if (existing) {
      dealsSkippedExisting++;
      continue;
    }

    await db.deal.create({
      data: {
        fundId,
        portfolioCompanyId,
        investmentType: d.investmentType,
        dealDate: d.dealDate,
        country: d.country,
        amountUsd: d.amountUsd,
        instrument: d.instrument,
        entryValuation: d.entryValuation,
        currentValuation: d.currentValuation,
        valuationAsOf: d.currentValuation !== null ? importedAt : null,
        notes: d.notes,
      },
    });
    dealsCreated++;
  }

  console.log("─── Write summary ────────────────────────────────────");
  console.log(`Funds upserted: ${fundsUpserted}`);
  console.log(`Portfolio companies upserted: ${companiesUpserted}`);
  console.log(`Deals created: ${dealsCreated}`);
  console.log(`Deals already present (idempotent skip): ${dealsSkippedExisting}`);
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const path = args.find((a) => !a.startsWith("--"));

  if (!path) {
    console.error("Usage: npx tsx scripts/import-investment-tracker.ts <path-to-xlsx> [--vehicles=A,B,C] [--write]");
    process.exit(1);
  }

  const { deals, funds, skipped } = parseWorkbook(path);

  buildReport(deals, funds, skipped);

  if (deals.length !== EXPECTED_DEAL_COUNT) {
    console.error(
      `HARD FAIL: parsed ${deals.length} deals, expected exactly ${EXPECTED_DEAL_COUNT}. The source file has drifted from the verified layout (F17) — refusing to import a partial/altered dataset. Re-verify before re-running.`
    );
    process.exit(1);
  }
  const distinctCompanies = new Set(deals.map((d) => d.company)).size;
  if (distinctCompanies !== EXPECTED_COMPANY_COUNT) {
    console.error(
      `HARD FAIL: parsed ${distinctCompanies} distinct companies, expected exactly ${EXPECTED_COMPANY_COUNT}. Refusing to import.`
    );
    process.exit(1);
  }
  const vehiclesSeen = new Set(deals.map((d) => d.vehicle));
  const expectedVehicles = new Set(KNOWN_VEHICLES);
  if (vehiclesSeen.size !== expectedVehicles.size || [...vehiclesSeen].some((v) => !expectedVehicles.has(v as VehicleSlug))) {
    console.error(`HARD FAIL: vehicle set drifted — saw {${[...vehiclesSeen].join(", ")}}. Refusing to import.`);
    process.exit(1);
  }

  if (!write) {
    // Dry run touches nothing — not even a read connection — so it never
    // depends on (or accidentally uses) whatever DATABASE_URL happens to be
    // ambient in the shell/.env. Company-matching (which needs a DB read)
    // only runs with --write, against the explicitly-provided DATABASE_URL.
    console.log("Dry run only — nothing written, no DB connection made.");
    console.log('Re-run with DATABASE_URL="<from the pulled prod env>" and --write to see the company-matching preview and perform the import.');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("HARD FAIL: --write requires DATABASE_URL to be set explicitly (no ambient fallback).");
    process.exit(1);
  }

  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const matches = await matchCompanies(db, [...new Set(deals.map((d) => d.company))]);
    console.log("");
    console.log("Company matching (Q14 — auto-link only unambiguous exact matches):");
    for (const [name, m] of matches) {
      if (m && "companyId" in m) console.log(`  ${name} -> auto-linked to Molly company "${m.companyName}" (${m.companyId})`);
      else if (m && "candidates" in m) console.log(`  ${name} -> AMBIGUOUS (${m.candidates.length} candidates) — left unlinked, editable later`);
      else console.log(`  ${name} -> no match — created with no link`);
    }
    console.log("");

    await db.$transaction(async (tx) => {
      await writeImport(tx as unknown as PrismaClient, deals, funds, matches);
    }, { timeout: 60_000 });
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
