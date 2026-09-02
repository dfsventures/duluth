import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Part 32, WS84 (F69) — guards against shadcn-era CSS variables
// (--primary, --border, --muted-foreground, --background, --foreground)
// leaking back into Recharts props via an "hsl(var(" wrapped string. Those
// names are never defined anywhere in this repo — the real token system is
// all "--color-*" in src/app/globals.css — so a value built that way
// silently resolves to an invalid colour and the chart element it's applied
// to renders with none. That is exactly what caused admin/page.tsx's bar
// chart and the founder-facing metric-chart to render invisibly. This test
// fails the build if that pattern is ever reintroduced anywhere in src/.
//
// The needle itself is built from parts (not a literal in this file) so the
// test's own source doesn't trip its own check.
const OFFENDING_PATTERN = ["hsl", "(var(--"].join("");
const SELF_PATH = __filename;

const SRC_DIR = join(__dirname, "..", "..");

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

describe("chart tokens", () => {
  it("contains no hsl(var(--…)) references anywhere in src/", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      if (file === SELF_PATH) continue;
      const content = readFileSync(file, "utf-8");
      if (content.includes(OFFENDING_PATTERN)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
