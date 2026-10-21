/**
 * Backfill: link memos that still carry a typed company name to the company or deal-ledger row
 * Molly now knows (Part 42, WS139). Dry run by default: it only reads.
 *
 * CONFIDENTIALITY: the table prints real memo titles and company names on screen only. Never paste
 * it into a commit, PR body or issue.
 *
 * DATABASE: takes DATABASE_URL from the shell for this run and refuses to run without it (dry run
 * included). It never falls back to a .env file. Pull the production env per the house procedure,
 * pass the URL explicitly, and delete the pulled file afterwards.
 *
 * Usage:
 *   # dry run (default): one line per pending memo, then the totals
 *   DATABASE_URL="<from the pulled env>" npx tsx scripts/link-memo-companies.ts --owner-email=<you>
 *
 *   # one memo first, then every confident match
 *   DATABASE_URL="<from the pulled env>" npx tsx scripts/link-memo-companies.ts --owner-email=<you> --write --only=<memo id>
 *   DATABASE_URL="<from the pulled env>" npx tsx scripts/link-memo-companies.ts --owner-email=<you> --write
 *
 * --owner-email: an approved admin who owns the memos; that user is the audit actor (linking is
 *   owner-only). --imported-only: only memos that came from the Notion import.
 * Only the "link" rows are written: exactly one confident match. Memos to check by hand (several or
 * only near matches) and memos with nothing to link to are left as they are. "Updated" dates are kept.
 * Re-running is safe: linked memos are out of scope.
 */
import { MEMO_DECISION_LABELS } from "@/lib/memos";

// Read BEFORE anything can load Prisma: the client auto-loads a local .env. Only a DATABASE_URL
// given in the shell for this run counts; the database modules are imported lazily below.
const EXPLICIT_DATABASE_URL = process.env.DATABASE_URL;

let dbHandle: { $disconnect: () => Promise<void> } | undefined;
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const kindLabel = (k: "company" | "ledger") => (k === "company" ? "company" : "deal ledger");

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const write = args.includes("--write");
  const importedOnly = args.includes("--imported-only");
  const ownerEmail = flag("owner-email")?.trim().toLowerCase();
  const only = flag("only")?.trim();

  if (!EXPLICIT_DATABASE_URL) {
    console.error("HARD FAIL: DATABASE_URL must be set explicitly in the shell for this run (no ambient fallback, no .env).");
    process.exit(1);
  }
  if (!ownerEmail) {
    console.error("HARD FAIL: --owner-email=<an approved admin who owns the memos> is required; that person is the audit actor.");
    console.error("Usage: DATABASE_URL=... npx tsx scripts/link-memo-companies.ts --owner-email=<you> [--write] [--only=<memo id>] [--imported-only]");
    process.exit(1);
  }
  if (only !== undefined && !only) {
    console.error("--only takes a memo id.");
    process.exit(1);
  }

  process.env.DATABASE_URL = EXPLICIT_DATABASE_URL;
  const { db } = await import("@/lib/db");
  dbHandle = db;
  const { runBackfill } = await import("@/lib/memo-link-backfill");

  const user = await db.user.findFirst({
    where: { email: { equals: ownerEmail, mode: "insensitive" } },
    select: { id: true, email: true, roles: true, status: true },
  });
  if (!user || user.status !== "APPROVED" || !user.roles.includes("ADMIN")) {
    console.error("HARD FAIL: --owner-email must be an approved admin in this database.");
    process.exit(1);
  }
  console.log("Database: connected.");
  console.log(write ? "Mode: WRITE (only the confident matches are linked)" : "Mode: dry run, nothing is written");

  const report = await runBackfill({ id: user.id, email: user.email }, { write, only, importedOnly });

  console.log("");
  console.log([pad("memo id", 27), pad("decision", 12), pad("action", 8), pad("memo", 30), "company"].join(" "));
  for (const r of report.rows) {
    const dl = r.decision ? (MEMO_DECISION_LABELS as Record<string, string>)[r.decision] ?? r.decision : "none";
    const what =
      r.action === "link"
        ? `-> ${r.target!.name} (${kindLabel(r.target!.kind)})`
        : r.action === "check"
          ? `check by hand: "${r.pendingName}" ~ ${r.candidates.map((c) => `${c.name} (${kindLabel(c.kind)})`).join("; ")}`
          : `"${r.pendingName}": nothing to link`;
    const result = r.result ? `  [${r.result}${r.error ? `: ${r.error}` : ""}]` : "";
    console.log([pad(r.memoId, 27), pad(dl, 12), pad(r.action, 8), pad(r.title.slice(0, 29), 30), what].join(" ") + result);
  }

  const t = report.totals;
  const pendingByDecision: Record<string, number> = {};
  for (const r of report.rows.filter((x) => x.action === "pending")) {
    const dl = r.decision ? (MEMO_DECISION_LABELS as Record<string, string>)[r.decision] ?? r.decision : "none";
    pendingByDecision[dl] = (pendingByDecision[dl] ?? 0) + 1;
  }
  console.log("");
  console.log(`To link: ${t.link} (${t.linkToCompany} to a company, ${t.linkToLedger} to the deal ledger)`);
  console.log(`To check by hand: ${t.check}`);
  console.log(`Left pending: ${t.pending}${t.pending ? ` (${Object.entries(pendingByDecision).map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}`);
  console.log(`Owned by someone else, skipped: ${report.skippedOtherOwner}`);
  if (report.written) {
    const w = report.written;
    console.log(`Written: linked ${w.linked}, stale ${w.stale}, failed ${w.failed}`);
    if (w.stale || w.failed) process.exitCode = 1;
  } else {
    console.log("\nDry run only: nothing was written.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbHandle?.$disconnect().catch(() => undefined);
  });
