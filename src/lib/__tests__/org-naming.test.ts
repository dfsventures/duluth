import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Part 32, WS81 — the same mistake was made independently in three files:
// "the Molly team" where "the DFS team" was meant. ORG_NAME exists for
// exactly this and is used correctly in ~40 other places. This guard is
// deliberately narrow: it matches the literal "Molly team" only, NOT bare
// "Molly" — there are 44 legitimate product-name uses in src/ (page titles,
// email subjects, "Sign in to your Molly account") and a broader rule would
// be permanently suppressed and therefore useless.
//
// NOTE: this guard CANNOT catch the third case it was written for —
// <Badge variant="info">Molly</Badge> (updates/[id]/page.tsx:762) is a bare
// product name in a staff-attribution slot. That class needs a human reviewer.
//
// If this string ever needs to name the software rather than DFS staff, use
// ORG_NAME from src/lib/org.ts instead of a hardcoded string.

const SRC_DIR = join(__dirname, "..", "..");
const SELF_PATH = __filename;
const NEEDLE = "molly team";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  let files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      files = files.concat(walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("org naming", () => {
  it('contains no "Molly team" string anywhere in src/ — use ORG_NAME from src/lib/org.ts', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (file === SELF_PATH) continue;
      const content = readFileSync(file, "utf-8").toLowerCase();
      if (content.includes(NEEDLE)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
