import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { surfaceForPath } from "../surface";

// Direction B (rounded corners, soft shadows, warm tints) is for founder and LP
// surfaces ONLY. Admin must render exactly as Direction A+. These tests pin the
// scoping: the B token values may appear only inside the [data-surface="founder"]
// block, the :root defaults must be the admin values, and every B component skin
// must be selector-scoped to the founder surface.

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf-8");
const tailwind = readFileSync(join(__dirname, "..", "..", "..", "tailwind.config.ts"), "utf-8");

function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error("unbalanced");
}

const founder = block(css, '[data-surface="founder"]');
const root = block(css, ":root");
const cssWithoutFounderBlock = css.replace(founder, "");

describe("surface scoping", () => {
  it("routes /admin to admin and everything else to founder", () => {
    expect(surfaceForPath("/admin")).toBe("admin");
    expect(surfaceForPath("/admin/companies")).toBe("admin");
    expect(surfaceForPath("/dashboard")).toBe("founder");
    expect(surfaceForPath("/updates/new")).toBe("founder");
    expect(surfaceForPath("/lp")).toBe("founder");
    expect(surfaceForPath(null)).toBe("founder");
  });

  it(":root keeps the admin radius scale, no resting shadows, Bone edges", () => {
    expect(root).toMatch(/--r-sm:\s*1px/);
    expect(root).toMatch(/--r-md:\s*2px/);
    expect(root).toMatch(/--r-lg:\s*2px/);
    expect(root).toMatch(/--r-ctl:\s*1px/);
    expect(root).toMatch(/--r-chip:\s*1px/);
    expect(root).toMatch(/--r-float:\s*1px/);
    expect(root).toMatch(/--r-sheet:\s*0px/);
    expect(root).toMatch(/--shadow-soft:\s*none/);
    expect(root).toMatch(/--shadow-lift:\s*none/);
    expect(root).toMatch(/--color-edge:\s*var\(--color-border\)/);
    expect(root).toMatch(/--color-btn2-bg:\s*transparent/);
    expect(root).toMatch(/--tracking-label:\s*0\.08em/);
  });

  it("the founder block carries the B radius scale and shadows", () => {
    expect(founder).toMatch(/--r-sm:\s*6px/);
    expect(founder).toMatch(/--r-md:\s*10px/);
    expect(founder).toMatch(/--r-ctl:\s*10px/);
    expect(founder).toMatch(/--r-float:\s*14px/);
    expect(founder).toMatch(/--shadow-soft:\s*0 1px 0/);
    expect(founder).toMatch(/--shadow-lift:/);
  });

  it("B values never appear outside the founder block (the :root default is the only other setter)", () => {
    expect(cssWithoutFounderBlock).not.toMatch(/--r-(sm|md|lg|ctl|float|sheet|def):\s*(6|10|14)px/);
    expect(cssWithoutFounderBlock).not.toMatch(/--r-chip:\s*9999px/);
    expect(cssWithoutFounderBlock).not.toMatch(/--color-edge:\s*transparent/);
    expect(cssWithoutFounderBlock).not.toMatch(/--color-btn2-bg:\s*#FFFFFF/i);
    expect(cssWithoutFounderBlock).not.toMatch(/--shadow-soft:\s*0 1px/);
    expect(cssWithoutFounderBlock).not.toMatch(/--tracking-label:\s*0\.06em/);
  });

  it("every Direction B component skin rule is scoped to the founder surface", () => {
    const section = css
      .slice(css.lastIndexOf("/*", css.indexOf("Direction B component skins")), css.indexOf("LP portal print stylesheet"))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...section.matchAll(/(^|\n)([^\n{}][^{}]*)\{/g)].map((m) => m[2].trim());
    expect(selectors.length).toBeGreaterThan(5);
    for (const sel of selectors) {
      for (const part of sel.split(",")) {
        expect(part.trim()).toMatch(/^\[data-surface="founder"\]/);
      }
    }
  });

  it("tailwind radii and shadows are token-driven, not literal B values", () => {
    expect(tailwind).toContain('sm: "var(--r-sm)"');
    expect(tailwind).toContain('md: "var(--r-md)"');
    expect(tailwind).toContain('float: "var(--r-float)"');
    expect(tailwind).toContain('soft: "var(--shadow-soft)"');
    expect(tailwind).not.toMatch(/(sm|md|lg|ctl|float):\s*"(6|10|14)px"/);
  });

  it("print: shadows are stripped from the LP scope", () => {
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/\.lp-print-scope \*\s*\{\s*box-shadow:\s*none !important/);
  });
});
