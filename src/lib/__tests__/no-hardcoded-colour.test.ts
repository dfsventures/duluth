import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard for PLAN-1 WS157 (F163/F164): in the admin, shared-UI, layout, auth and LP
 * code, colour comes from a token (bg-background, text-foreground, border-border,
 * bg-card, bg-mark, ...), never from a fixed brand-name class, bg-white or a hex
 * literal. Fixed colours don't follow the theme, so in the new look's dark mode
 * they turn unreadable.
 *
 * Deliberately NOT scanned: src/app/share/** and components/share/**,
 * company-brand.tsx and company/branding-card.tsx (the company's own theme colours),
 * the print stylesheets (globals.css), emails (src/lib/email*), and the login
 * page (Google's logo colours).
 *
 * Each exception below is an exact match in one file, with the reason. A stale
 * exception (the match is gone) fails the test too, so the list can't rot.
 */

const ROOT = join(process.cwd(), "src");
const SCAN_DIRS = [
  "app/admin",
  "app/lp",
  "components/ui",
  "components/layout",
  "components/admin",
  "components/auth",
  "components/lp",
];

const FIXED_COLOUR =
  /\b(?:bg-white|text-white|bg-black|text-black)\b|#[0-9A-Fa-f]{6}\b|\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|placeholder|decoration|accent|caret)-(?:paper|bone|obsidian|tide|sky)\b/g;

// file (relative to src) -> allowed match -> why
const EXCEPTIONS: Record<string, Record<string, string>> = {
  "components/ui/logo-mark.tsx": {
    "#5B8DC5": "the wordmark's Sky underscore is always Sky (letters are currentColor)",
  },
  "components/ui/rich-editor.tsx": {
    "#44688E": "fallback inside var(--color-accent, #44688E) in the editor's own stylesheet",
    "#EBE8DE": "a comment explaining a contrast ratio against Paper",
  },
  "components/admin/company/profile-card.tsx": {
    "bg-white": "backing for a company's uploaded logo, which may be a transparent PNG; must stay white in every theme",
  },
  "components/admin/memos/memo-board-card.tsx": {
    "#8C897B": "outline of the Draft status dot: a neutral grey that reads on both light and dark tiles",
  },
  "app/admin/providers/page.tsx": {
    "text-obsidian": "dark text on a solid Ochre pill; Ochre is a fixed fill, so its text must be fixed too",
  },
  "app/admin/reports/[id]/page.tsx": {
    "bg-white": "bg-white/60 input inside an Ochre notice; needs an alpha token (listed for a later pass)",
  },
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("no hard-coded colour in admin, shared UI, layout, auth and LP code", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it("scans a sensible number of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("uses tokens, not fixed colours, apart from the listed exceptions", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).split("\\").join("/");
      const allowed = EXCEPTIONS[rel] ?? {};
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(FIXED_COLOUR)) {
        if (!(m[0] in allowed)) offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no stale exceptions", () => {
    const stale: string[] = [];
    for (const [rel, allowed] of Object.entries(EXCEPTIONS)) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      const found = new Set([...text.matchAll(FIXED_COLOUR)].map((m) => m[0]));
      for (const match of Object.keys(allowed)) {
        if (!found.has(match)) stale.push(`${rel}: ${match}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("the wordmark letters follow the text colour", () => {
    const logo = readFileSync(join(ROOT, "components/ui/logo-mark.tsx"), "utf8");
    expect(logo).not.toContain("#14140F");
    expect(logo).toContain('fill="currentColor"');
  });
});
