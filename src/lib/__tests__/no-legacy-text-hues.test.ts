import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// UI overhaul phase 7: text must use the tint ink tokens (text-tone-*-ink) or
// the foreground, never the raw brand hues, which fail WCAG AA on Paper and on
// their own tints (ochre 2.2:1, sky 2.8:1, acacia 3.8:1, laterite 4.1:1).
const LEGACY = /(?<![\w-])(?:[\w:[\]-]+:)?text-(ochre|acacia|laterite|sky)(?![\w-])/;

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

describe("legacy brand-hue text classes", () => {
  it("are not used for text anywhere under src", () => {
    const offenders: string[] = [];
    for (const f of walk(join(process.cwd(), "src"))) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (LEGACY.test(line)) offenders.push(`${f}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
