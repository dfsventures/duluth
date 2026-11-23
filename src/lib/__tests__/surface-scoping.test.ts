import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { inNewLookScope, surfaceForPath } from "../surface";

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
// The new look (PLAN-1, WS156) is a third, opt-in scope with its own radius scale
// (it legitimately uses 6/10px). It is checked on its own below.
const V2_START = css.indexOf("/* ── New look (PLAN-1, WS156)");
const V2_END = css.indexOf("/* ── End new look ── */");
const v2Section = css.slice(V2_START, V2_END);
const cssWithoutFounderBlock = css.replace(founder, "").replace(v2Section, "");

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

  it("new look: every selector is v2 AND shell scoped; none can match :root, LP, auth or share", () => {
    expect(V2_START).toBeGreaterThan(0);
    expect(V2_END).toBeGreaterThan(V2_START);
    // @media and @container wrappers (phone-only values, columns dropping out) are skipped; the
    // selectors inside them are still checked.
    const selectors = [...v2Section.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@(media|container)[^{]*\{/g, "").matchAll(/(^|\n)([^\n{}][^{}]*)\{/g)].map((m) => m[2].trim());
    expect(selectors.length).toBeGreaterThanOrEqual(2);
    for (const sel of selectors) {
      for (const part of sel.split(",")) {
        const p = part.trim();
        expect(p).toContain("[data-v2-scope]");
        expect(p).toMatch(/^html\[data-look="v2"\]/);
        expect(p).not.toMatch(/^:root/);
        // The founder surface is named only together with the shell scope (the Direction B overrides).
        if (p.includes('[data-surface="founder"]')) expect(p).toContain('[data-v2-scope][data-surface="founder"]');
      }
    }
  });

  it("new look scope: the app shell, LP, auth and home carry it; share pages and the report preview frame never do", () => {
    const read = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf-8");
    // Stage 1 and 2 (WS165, WS166): each wrapper carries the marker, and mirrors it onto <body> for portalled layers.
    for (const f of ["components/layout/app-shell.tsx", "app/lp/layout.tsx", "components/auth/auth-layout.tsx", "app/page.tsx"]) {
      expect(read(f), f).toContain('data-v2-scope=""');
    }
    for (const f of ["components/layout/app-shell.tsx", "app/lp/layout.tsx", "components/auth/auth-layout.tsx"]) {
      expect(read(f), f).toMatch(/<SurfaceSync surface=\S+ newLookScope \/>/);
    }
    const sync = read("components/layout/surface-sync.tsx");
    expect(sync).toContain('if (newLookScope) body.setAttribute("data-v2-scope", "")');
    expect(sync).toContain("newLookScope = false");
    // Never: investor share links and the report preview frame (it mirrors the surface onto <body>, not the scope).
    for (const f of ["app/share/[token]/page.tsx", "app/investors/page.tsx", "app/admin/reports/[id]/preview/frame/page.tsx"]) {
      expect(read(f), f).not.toContain("data-v2-scope");
      expect(read(f), f).not.toContain("newLookScope");
    }
  });

  it("new look scope by path: admin, the founder app pages, LP, auth and home; never share links, the preview frame or the print page", () => {
    for (const p of ["/admin", "/admin/companies", "/admin/reports/x/preview", "/dashboard", "/updates", "/updates/new", "/updates/abc", "/from-dfs/x", "/company/profile", "/company/metrics", "/planner/abc", "/links", "/team", "/providers", "/diligence", "/setup-wizard", "/", "/lp", "/lp/reports/x", "/login", "/signup", "/set-password"]) {
      expect(inNewLookScope(p), p).toBe(true);
    }
    for (const p of [null, "/share/abc", "/share/m/abc", "/investors", "/admin/reports/x/preview/frame", "/updates/abc/download", "/dashboards", "/linksx", "/lpx", "/loginx"]) {
      expect(inNewLookScope(p), String(p)).toBe(false);
    }
  });

  it("new look on LP and auth: report reading column, prose size and dark-theme print stay inside the scope", () => {
    expect(v2Section).toMatch(/\[data-v2-scope\] \.lp-report article \{\s*max-width: 720px;/);
    expect(v2Section).toMatch(/\[data-v2-scope\] \.lp-report \.report-body \{\s*font-size: 14px;\s*line-height: 22px;/);
    // Printing in the dark theme puts the light text and page colours back on the LP wrapper.
    expect(v2Section).toMatch(/@media print \{\s*html\[data-look="v2"\]\[data-theme="dark"\] \[data-v2-scope\]\.lp-print-scope \{[^}]*--color-bg: #FFFFFF;[^}]*--color-text-primary: #15181D;/);
    // The preview frame shares the LP markup but no scope: it carries no lp-report hook either.
    expect(readFileSync(join(__dirname, "..", "..", "app", "admin", "reports", "[id]", "preview", "frame", "page.tsx"), "utf-8")).not.toContain("lp-report");
  });

  it("new look: nothing outside the v2 section mentions data-look or the Inter variable, and the founder block never sets fonts", () => {
    expect(cssWithoutFounderBlock).not.toContain("data-look");
    expect(cssWithoutFounderBlock).not.toContain("--font-inter");
    expect(founder).not.toContain("--font-");
    expect(root).not.toContain("--font-");
  });

  it("new look: no v2 selector can match the share pages or emails (they carry no data-surface and no admin ancestor)", () => {
    // Share pages are rendered without data-surface; email HTML never loads this stylesheet.
    // surfaceForPath only ever yields "admin" for /admin paths.
    expect(surfaceForPath("/share/abc")).toBe("founder");
    expect(surfaceForPath("/share/m/abc")).toBe("founder");
    // The founder surface appears only fused to the shell scope ("[data-v2-scope][data-surface=...]").
    expect(v2Section).not.toMatch(/(^|[\s,])\[data-surface="founder"\]|:root|(^|\n)\s*body\s*\{/);
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
