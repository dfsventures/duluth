/**
 * One-time importer: the team's Notion "Investment Pipeline" export -> Molly's investment memos
 * (Part 41, WS134). Q126-A: a one-off script run by an admin, dry run by default.
 *
 * CONFIDENTIALITY: the export is real deal data (company names, partner-fund tags, call links, deck
 * files). It must never enter this repository. This script takes the export folder as a CLI argument
 * pointing OUTSIDE the repo tree and refuses a path inside it. Only the `*.md` pages are read; deck
 * files are never opened. The dry-run table prints real titles on screen only: never paste it
 * into a commit, PR body or issue.
 *
 * Source: the `<Name> <32-hex id>.md` pages directly inside the database folder (JC-NI-A). The CSVs
 * are read only to compare row counts. Unzip the export first.
 *
 * Usage:
 *   # dry run (default): parses, validates, prints the table; writes nothing. With DATABASE_URL set
 *   # it also reads the database (already-imported pages, company matches); without it, or with
 *   # --no-db, it runs fully offline and says so.
 *   npx tsx scripts/import-notion-memos.ts "<export>/Investment Pipeline" --owner-email=<you>
 *   npx tsx scripts/import-notion-memos.ts "<export>/Investment Pipeline" --no-db
 *
 *   # optional: a local HTML preview of every memo, rendered by renderMemoMarkdown (path outside the repo)
 *   ... --preview-html=<path outside the repo>/notion-preview.html
 *
 *   # one memo first, then all (prod env pulled per the house procedure; delete the file after)
 *   DATABASE_URL="<from the pulled env>" npx tsx scripts/import-notion-memos.ts "<dir>" --owner-email=<you> --write --only=<32-hex id>
 *   DATABASE_URL="<from the pulled env>" npx tsx scripts/import-notion-memos.ts "<dir>" --owner-email=<you> --write
 *
 * Re-running is safe: a page whose Notion id is already imported is skipped.
 */
import fs from "fs";
import path from "path";
import { renderMemoMarkdown } from "@/lib/memo-render";
import { MEMO_DECISION_LABELS } from "@/lib/memos";
import { parseNotionPage, statusForDecision, type NotionMemoDraft, type NotionParse } from "@/lib/notion-memo-import";

// Read BEFORE anything can load Prisma: the client auto-loads a local .env (which may hold some other
// database's URL). Only a DATABASE_URL given in the shell for this run counts; the database modules
// are imported lazily below, and not at all in an offline run.
const EXPLICIT_DATABASE_URL = process.env.DATABASE_URL;

const REPO_ROOT = path.resolve(__dirname, "..");
const HEX32 = /(?:^|[\s_-])([0-9a-f]{32})\.md$/i;

const insideRepo = (p: string) => {
  const rel = path.relative(REPO_ROOT, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Rows in a Notion CSV (a header plus records; newlines inside quoted fields do not count). */
function countCsvRows(text: string): number {
  let inQuotes = false;
  let rows = 0;
  let nonEmpty = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
      nonEmpty = true;
    } else if (c === "\n" && !inQuotes) {
      if (nonEmpty) rows++;
      nonEmpty = false;
    } else if (c !== "\r") nonEmpty = true;
  }
  if (nonEmpty) rows++;
  return Math.max(rows - 1, 0);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function previewHtml(drafts: NotionMemoDraft[]): string {
  const body = drafts
    .map((d) => {
      const meta = [d.decision ? MEMO_DECISION_LABELS[d.decision] : null, d.source, d.tags.join(", ") || null, d.introDate].filter(Boolean).join(" · ");
      const secs = d.sections
        .map(
          (s) =>
            `<section><h2>${escapeHtml(s.title)}${s.includeInShare ? "" : ' <small class="off">not in share links</small>'}</h2><div class="md">${renderMemoMarkdown(s.markdown, { surface: "app" })}</div></section>`
        )
        .join("\n");
      return `<article><h1>${escapeHtml(d.title)}</h1><p class="meta">${escapeHtml(meta)}</p>${secs}</article>`;
    })
    .join("\n<hr>\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notion memo preview</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111}
h1{font-size:1.6rem}h2{font-size:1.1rem;margin-top:1.6rem}.meta{color:#666}.off{color:#a15c00;font-weight:400}
table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}blockquote{border-left:3px solid #ccc;margin:1rem 0;padding:0 1rem;color:#444}</style></head>
<body>${body}</body></html>`;
}

let dbHandle: { $disconnect: () => Promise<void> } | undefined;
const pad = (s: string | number, n: number) => String(s).padEnd(n);

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const write = args.includes("--write");
  const noDb = args.includes("--no-db");
  const target = args.find((a) => !a.startsWith("--"));
  const ownerEmail = flag("owner-email")?.trim().toLowerCase();
  const only = flag("only")?.trim().toLowerCase();
  const previewPath = flag("preview-html");

  if (!target) {
    console.error('Usage: npx tsx scripts/import-notion-memos.ts "<export>/Investment Pipeline" [--owner-email=<you>] [--no-db] [--preview-html=<path>] [--write] [--only=<32-hex id>]');
    process.exit(1);
  }
  const dir = path.resolve(target);
  if (/\.zip$/i.test(dir)) {
    console.error("Unzip the export first; only the .md files are read.");
    process.exit(1);
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error("The path must be the unzipped database folder (the one holding the .md pages).");
    process.exit(1);
  }
  if (insideRepo(dir) || insideRepo(fs.realpathSync(dir))) {
    console.error("HARD FAIL: the export is confidential deal data and must stay outside the repository.");
    process.exit(1);
  }
  if (previewPath && insideRepo(path.resolve(previewPath))) {
    console.error("HARD FAIL: write the preview outside the repository.");
    process.exit(1);
  }
  if (only && !/^[0-9a-f]{32}$/.test(only)) {
    console.error("--only takes a 32-character Notion page id.");
    process.exit(1);
  }
  if (write && noDb) {
    console.error("HARD FAIL: --write needs the database; remove --no-db.");
    process.exit(1);
  }
  if (write && !EXPLICIT_DATABASE_URL) {
    console.error("HARD FAIL: --write requires DATABASE_URL to be set explicitly (no ambient fallback).");
    process.exit(1);
  }
  if (write && !ownerEmail) {
    console.error("HARD FAIL: --write requires --owner-email=<an approved admin>; that person owns the memos and is the audit actor.");
    process.exit(1);
  }
  const useDb = !noDb && !!EXPLICIT_DATABASE_URL;
  let db: typeof import("@/lib/db").db | undefined;
  let actions: typeof import("@/lib/memo-actions") | undefined;
  if (useDb) {
    process.env.DATABASE_URL = EXPLICIT_DATABASE_URL;
    db = (await import("@/lib/db")).db;
    actions = await import("@/lib/memo-actions");
    dbHandle = db;
  }

  // Pages and the row-count cross-check.
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".md") && HEX32.test(f) && fs.statSync(path.join(dir, f)).isFile())
    .sort();
  // Notion puts the database's CSVs next to its folder (sometimes inside it).
  const csvRows = [dir, path.dirname(dir)].flatMap((where) =>
    fs
      .readdirSync(where)
      .filter((f) => f.toLowerCase().endsWith(".csv") && (where === dir || f.startsWith(path.basename(dir))))
      .map((f) => countCsvRows(fs.readFileSync(path.join(where, f), "utf8")))
  );
  console.log(`Pages: ${files.length}${csvRows.length ? ` (CSV rows: ${csvRows.join(", ")})` : " (no CSV found)"}`);
  if (csvRows.some((n) => n !== files.length)) console.warn("WARNING: a CSV's row count differs from the number of pages.");
  if (!files.length) {
    console.error("No Notion pages (<Name> <32-hex id>.md) found in that folder.");
    process.exit(1);
  }

  // Owner (database mode only).
  let actor = { id: "dry-run", email: ownerEmail ?? null };
  if (useDb) {
    if (!ownerEmail) {
      console.error("HARD FAIL: --owner-email=<an approved admin> is required when the database is used.");
      process.exit(1);
    }
    const user = await db!.user.findFirst({ where: { email: { equals: ownerEmail, mode: "insensitive" } }, select: { id: true, email: true, roles: true, status: true } });
    if (!user || user.status !== "APPROVED" || !user.roles.includes("ADMIN")) {
      console.error("HARD FAIL: --owner-email must be an approved admin in this database.");
      process.exit(1);
    }
    actor = { id: user.id, email: user.email };
  }
  console.log(useDb ? "Database: connected (the dry run only reads)." : "Database: offline (no DATABASE_URL in the shell, or --no-db): company matches and already-imported pages are not checked.");
  console.log(write ? "Mode: WRITE" : "Mode: dry run, nothing is written");

  const parsed: { file: string; result: NotionParse }[] = files
    .map((file) => ({ file, result: parseNotionPage(file, fs.readFileSync(path.join(dir, file), "utf8")) }))
    .filter((p) => !only || (p.result.kind === "memo" ? p.result.draft.notionId : p.result.notionId) === only);
  if (only && !parsed.length) {
    console.error("No page with that id.");
    process.exit(1);
  }

  const memoIds = parsed.flatMap((p) => (p.result.kind === "memo" ? [p.result.draft.notionId] : []));
  const already = new Set<string>();
  if (useDb && memoIds.length) {
    const rows = await db!.memo.findMany({ where: { notionId: { in: memoIds } }, select: { notionId: true } });
    for (const r of rows) if (r.notionId) already.add(r.notionId);
  }

  // Table.
  console.log("");
  console.log([pad("id", 33), pad("decision", 12), pad("mode", 7), pad("secs", 5), pad("noshr", 6), pad("chars", 7), pad("company", 8), pad("deck", 12), pad("warn", 5), pad("title", 28), "result"].join(" "));
  const tally = { import: 0, already: 0, stub: 0, error: 0, noShare: 0, sections: 0, linked: 0, pending: 0, deckUrl: 0, deckFile: 0, warnings: 0, overLimit: 0, html: 0 };
  const toImport: NotionMemoDraft[] = [];
  const decisions: Record<string, number> = {};
  for (const { result } of parsed) {
    if (result.kind === "stub") {
      tally.stub++;
      console.log([pad(result.notionId, 33), pad("", 12), pad("", 7), pad("", 5), pad("", 6), pad("", 7), pad("", 8), pad("", 12), pad("", 5), pad(result.title.slice(0, 27), 28), "stub"].join(" "));
      continue;
    }
    if (result.kind === "error") {
      tally.error++;
      console.log([pad(result.notionId ?? "?", 33), pad("", 12), pad("", 7), pad("", 5), pad("", 6), pad("", 7), pad("", 8), pad("", 12), pad("", 5), pad(result.title.slice(0, 27), 28), `error: ${result.error}`].join(" "));
      continue;
    }
    const d = result.draft;
    const chars = d.sections.reduce((n, s) => n + s.markdown.length, 0);
    const noShare = d.sections.filter((s) => !s.includeInShare).length;
    let company = "?";
    if (useDb) company = (await actions!.suggestCompany(d.title)) ? "linked" : "pending";
    if (company === "linked") tally.linked++;
    if (company === "pending") tally.pending++;
    const deck = d.deck ? (d.deck.kind === "url" ? "url" : "file (step 2)") : "-";
    if (d.deck?.kind === "url") tally.deckUrl++;
    if (d.deck?.kind === "file") tally.deckFile++;
    const isDone = already.has(d.notionId);
    if (isDone) tally.already++;
    else {
      tally.import++;
      toImport.push(d);
    }
    tally.noShare += noShare;
    tally.sections += d.sections.length;
    tally.warnings += d.warnings.length;
    if (d.sections.some((s) => s.markdown.length > 20_000) || chars > 150_000 || d.sections.length > 30) tally.overLimit++;
    if (d.sections.some((s) => /<\/?[a-z][^>\n]*>/i.test(s.markdown.replace(/`[^`]*`/g, "").replace(/<https?:[^>]*>/gi, "")))) tally.html++;
    const dl = d.decision ? MEMO_DECISION_LABELS[d.decision] : "none";
    decisions[dl] = (decisions[dl] ?? 0) + 1;
    console.log(
      [pad(d.notionId, 33), pad(dl, 12), pad(d.splitMode, 7), pad(d.sections.length, 5), pad(noShare, 6), pad(chars, 7), pad(company, 8), pad(deck, 12), pad(d.warnings.length, 5), pad(d.title.slice(0, 27), 28), isDone ? "already imported" : "would import"].join(" ")
    );
    for (const w of d.warnings) console.log(`        warning: ${w}`);
  }

  console.log("");
  console.log(`Would import: ${tally.import} (${Object.entries(decisions).map(([k, v]) => `${k} ${v}`).join(", ") || "none"})`);
  console.log(`Already imported: ${tally.already}${useDb ? "" : " (not checked offline)"}`);
  console.log(`Skipped as stubs: ${tally.stub}`);
  console.log(`Errors: ${tally.error}`);
  console.log(`Sections: ${tally.sections}; out of share links by default: ${tally.noShare}`);
  console.log(`Over a limit (section 20,000 / memo 150,000 / 30 sections): ${tally.overLimit}`);
  console.log(`Memos with raw HTML left in section text: ${tally.html}`);
  console.log(`Company: ${useDb ? `${tally.linked} linked, ${tally.pending} pending` : "not checked offline"}`);
  console.log(`Deck: ${tally.deckFile} file(s) skipped (step 2), ${tally.deckUrl} URL(s) kept as citations`);
  console.log(`Warnings: ${tally.warnings}`);

  if (previewPath) {
    const all = parsed.flatMap((p) => (p.result.kind === "memo" ? [p.result.draft] : []));
    fs.mkdirSync(path.dirname(path.resolve(previewPath)), { recursive: true });
    fs.writeFileSync(path.resolve(previewPath), previewHtml(all));
    console.log(`Preview written: ${path.resolve(previewPath)} (${all.length} memos)`);
  }

  if (!write) {
    console.log(useDb ? "\nDry run only: nothing was written." : "\nDry run only: nothing was written, no database was used.");
    return;
  }

  // Write: file-name order, one memo per call.
  let imported = 0;
  let duplicates = 0;
  let errors = tally.error;
  for (const d of toImport) {
    try {
      const r = await actions!.importMemo(actor, d, { status: statusForDecision(d.decision) });
      if (!r.ok) {
        errors++;
        console.error(`error ${d.notionId}: ${r.error}`);
      } else if (r.value.duplicate) duplicates++;
      else {
        imported++;
        console.log(`imported ${d.notionId} -> ${r.value.id}`);
      }
    } catch (err) {
      errors++;
      console.error(`error ${d.notionId}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\nimported ${imported}, already imported ${tally.already + duplicates}, errors ${errors}`);
  if (errors) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbHandle?.$disconnect().catch(() => undefined);
  });
