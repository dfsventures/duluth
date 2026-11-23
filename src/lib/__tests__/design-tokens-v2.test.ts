import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { TONES, type Tone } from "../status-tone";
import { cn } from "../utils";

// New look (PLAN-1, WS156, finding F165). design-tokens.test.ts reads the FIRST
// match of a variable in globals.css, so it can never see values that a later
// scoped block redefines. This suite parses the two v2 blocks themselves
// (between the marker comments) and checks WCAG AA for every required pair in
// BOTH themes: text pairs 4.5:1, glyph / control pairs 3:1.

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf-8");
const START = "/* ── New look (PLAN-1, WS156)";
const END = "/* ── End new look ── */";
const section = css.slice(css.indexOf(START), css.indexOf(END));

function blockFor(selectorStart: string): Record<string, string> {
  const at = section.indexOf(selectorStart);
  if (at < 0) throw new Error(`no v2 block starting ${selectorStart}`);
  const open = section.indexOf("{", at);
  const close = section.indexOf("}", open);
  const body = section.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)) vars[m[1]] = m[2].trim();
  return vars;
}

const LIGHT = blockFor('html[data-look="v2"] [data-v2-scope],');
const DARK = blockFor('html[data-look="v2"][data-theme="dark"] [data-v2-scope],');

type RGBA = { r: number; g: number; b: number; a: number };

function parse(value: string): RGBA {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] };
  throw new Error(`cannot parse colour "${value}"`);
}

/** Composites a (possibly translucent) colour over an opaque base. */
function over(top: RGBA, base: RGBA): RGBA {
  const a = top.a;
  return { r: top.r * a + base.r * (1 - a), g: top.g * a + base.g * (1 - a), b: top.b * a + base.b * (1 - a), a: 1 };
}

function lum(c: RGBA): number {
  const ch = [c.r, c.g, c.b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(a: RGBA, b: RGBA): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const THEMES = [
  ["light", LIGHT],
  ["dark", DARK],
] as const;

const REQUIRED_LIGHT_ONLY = ["--r-sm", "--r-md", "--r-lg", "--r-def", "--r-ctl", "--r-chip", "--r-float", "--r-sheet", "--shadow-soft", "--shadow-lift", "--tracking-label", "--font-sans"];
const REQUIRED_BOTH = [
  "--color-bg", "--color-sidebar", "--color-pane", "--color-surface", "--color-well",
  "--color-row-hover", "--color-sel", "--color-open", "--color-row-divider", "--color-border", "--color-border-hover", "--color-ctl",
  "--color-text-primary", "--color-text-secondary", "--color-text-muted",
  "--color-accent", "--color-accent-hover", "--color-accent-rgb", "--color-accent-foreground", "--color-accent-soft",
  "--color-done", "--color-done-soft", "--color-stuck", "--color-stuck-soft", "--color-warn", "--color-warn-soft",
  "--shadow-float", "--scrim",
  ...(["stone", "sky", "sage", "clay", "sand", "amber"] as const).flatMap((t) => [`--tone-${t}-fill`, `--tone-${t}-ink`]),
];

describe("new look: the blocks exist and are complete", () => {
  it("the section markers are found", () => {
    expect(section.length).toBeGreaterThan(500);
  });

  it("the light block carries every role, the radius scale and Inter", () => {
    for (const k of [...REQUIRED_BOTH, ...REQUIRED_LIGHT_ONLY]) expect(LIGHT[k], `light ${k}`).toBeTruthy();
    expect(LIGHT["--font-sans"]).toBe("var(--font-inter)");
    expect(LIGHT["--r-md"]).toBe("8px");
    expect(LIGHT["--r-float"]).toBe("12px");
  });

  it("the dark block redefines every colour role (nothing falls through from light)", () => {
    for (const k of REQUIRED_BOTH) expect(DARK[k], `dark ${k}`).toBeTruthy();
    // The primary scale and destructive follow the accent in dark, or avatar chips and destructive text break.
    for (const k of ["--color-primary-100", "--color-primary-700", "--color-destructive-rgb", "--color-destructive-foreground"]) {
      expect(DARK[k], `dark ${k}`).toBeTruthy();
    }
  });
});

describe.each(THEMES)("new look AA, %s theme", (_name, vars) => {
  const c = (k: string) => parse(vars[k]);
  const SOLID = ["--color-bg", "--color-sidebar", "--color-pane", "--color-surface", "--color-well"];
  const bg = () => c("--color-bg");
  // Translucent tiers sit on the page (worst case for the list); also on the pane.
  const tiers: [string, RGBA][] = [
    ...SOLID.map((k): [string, RGBA] => [k, c(k)]),
    ["row-hover", over(c("--color-row-hover"), bg())],
    ["sel", over(c("--color-sel"), bg())],
    ["open", over(c("--color-open"), bg())],
    ["open on pane", over(c("--color-open"), c("--color-pane"))],
  ];

  it("text primary, secondary and muted pass 4.5:1 on every tier", () => {
    for (const text of ["--color-text-primary", "--color-text-secondary", "--color-text-muted"]) {
      for (const [tier, surface] of tiers) {
        expect(ratio(c(text), surface), `${text} on ${tier}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("accent as text, link and focus passes 4.5:1 on every tier and on accent-soft", () => {
    for (const [tier, surface] of tiers) {
      expect(ratio(c("--color-accent"), surface), `accent on ${tier}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(c("--color-accent"), over(c("--color-accent-soft"), bg()))).toBeGreaterThanOrEqual(4.5);
  });

  it("on-accent text passes 4.5:1 on the accent and on its hover", () => {
    expect(ratio(c("--color-accent-foreground"), c("--color-accent"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c("--color-accent-foreground"), c("--color-accent-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("state colours (done, stuck, warn) pass 4.5:1 on every tier and on their own soft fill", () => {
    for (const s of ["done", "stuck", "warn"]) {
      for (const [tier, surface] of tiers) {
        expect(ratio(c(`--color-${s}`), surface), `${s} on ${tier}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const base of [bg(), c("--color-pane")]) {
        expect(ratio(c(`--color-${s}`), over(c(`--color-${s}-soft`), base)), `${s} on its soft fill`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("every tone ink passes 4.5:1 on its fill", () => {
    for (const t of ["stone", "sky", "sage", "clay", "sand", "amber"]) {
      expect(ratio(c(`--tone-${t}-ink`), c(`--tone-${t}-fill`)), `tone ${t}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("control borders pass 3:1 on the page and on the pane", () => {
    expect(ratio(c("--color-ctl"), c("--color-bg"))).toBeGreaterThanOrEqual(3);
    expect(ratio(c("--color-ctl"), c("--color-pane"))).toBeGreaterThanOrEqual(3);
  });

  it("the surface tiers stay ordered by tone, not by shadow (sidebar and raised differ from the page)", () => {
    expect(vars["--color-bg"]).not.toBe(vars["--color-sidebar"]);
    expect(vars["--color-bg"]).not.toBe(vars["--color-surface"]);
  });
});

describe("new look: the primary scale and destructive in dark", () => {
  it("destructive foreground on destructive passes 4.5:1", () => {
    const [r, g, b] = DARK["--color-destructive-rgb"].split(/\s+/).map(Number);
    expect(ratio(parse(DARK["--color-destructive-foreground"]), { r, g, b, a: 1 })).toBeGreaterThanOrEqual(4.5);
  });

  it("primary-700 (avatar text) on primary-100 (avatar fill) passes 4.5:1", () => {
    const fill = over(parse(DARK["--color-primary-100"]), parse(DARK["--color-sidebar"]));
    expect(ratio(parse(DARK["--color-primary-700"]), fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent rgb triplets match the accent hex in both themes", () => {
    for (const [, vars] of THEMES) {
      const { r, g, b } = parse(vars["--color-accent"]);
      expect(vars["--color-accent-rgb"].split(/\s+/).map(Number)).toEqual([r, g, b]);
    }
  });
});

describe("new look: light tones stay equal to the old look", () => {
  (Object.keys(TONES) as Tone[]).forEach((tone) => {
    it(`${tone}: light v2 fill and ink are the same as status-tone.ts`, () => {
      expect(LIGHT[`--tone-${tone}-fill`].toUpperCase()).toBe(TONES[tone].fill.toUpperCase());
      expect(LIGHT[`--tone-${tone}-ink`].toUpperCase()).toBe(TONES[tone].ink.toUpperCase());
    });
  });
});

// WS159: the pairs the core components use. Buttons (primary, secondary ghost, destructive and
// the faint shortcut hint) and chips (a set filter chip, the unset dashed chip, a stage chip).
describe.each(THEMES)("new look core components, %s theme", (themeName, vars) => {
  const c = (k: string) => parse(vars[k]);
  const rootAt = css.indexOf(":root {");
  const rootBody = css.slice(css.indexOf("{", rootAt) + 1, css.indexOf("\n}", rootAt));
  // Destructive is not redefined in the light v2 block: it falls through from :root.
  const destructive = (): RGBA => {
    const rgb = vars["--color-destructive-rgb"] ?? /--color-destructive-rgb:\s*([^;]+);/.exec(rootBody)![1];
    const [r, g, b] = rgb.trim().split(/\s+/).map(Number);
    return { r, g, b, a: 1 };
  };
  const destructiveInk = () => parse(vars["--color-destructive-foreground"] ?? /--color-destructive-foreground:\s*([^;]+);/.exec(rootBody)![1]);
  const bg = () => c("--color-bg");

  it("primary: label on the accent and on its hover", () => {
    expect(ratio(c("--color-accent-foreground"), c("--color-accent"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c("--color-accent-foreground"), c("--color-accent-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("primary: the shortcut hint (label at 90% opacity) still passes 4.5:1 on the accent", () => {
    const hint = over({ ...c("--color-accent-foreground"), a: 0.9 }, c("--color-accent"));
    expect(ratio(hint, c("--color-accent"))).toBeGreaterThanOrEqual(4.5);
  });

  it("secondary (ghost): label on the page, the pane, and on its hover fill (muted)", () => {
    const [r, g, b] = vars["--color-muted-rgb"].split(/\s+/).map(Number);
    for (const surface of [bg(), c("--color-pane"), c("--color-sidebar"), { r, g, b, a: 1 }]) {
      expect(ratio(c("--color-text-primary"), surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("secondary: the shortcut hint (muted text) passes 4.5:1 on the page, the pane and the hover fill", () => {
    const [r, g, b] = vars["--color-muted-rgb"].split(/\s+/).map(Number);
    for (const surface of [bg(), c("--color-pane"), { r, g, b, a: 1 }]) {
      expect(ratio(c("--color-text-muted"), surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it(`destructive: label on the destructive fill (${themeName})`, () => {
    expect(ratio(destructiveInk(), destructive())).toBeGreaterThanOrEqual(4.5);
  });

  it("chips: a set filter chip (accent on accent-soft) and its value (secondary text) pass 4.5:1 on the page and the pane", () => {
    for (const base of [bg(), c("--color-pane")]) {
      const fill = over(c("--color-accent-soft"), base);
      expect(ratio(c("--color-accent"), fill)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c("--color-text-secondary"), fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("chips: the unset dashed chip (control border) passes 3:1 and its label passes 4.5:1", () => {
    for (const base of [bg(), c("--color-pane")]) {
      expect(ratio(c("--color-ctl"), base)).toBeGreaterThanOrEqual(3);
      expect(ratio(c("--color-text-secondary"), base)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("chips: every stage and column tone (ink on fill) passes 4.5:1", () => {
    for (const t of ["stone", "sky", "sage", "clay", "sand", "amber"]) {
      expect(ratio(c(`--tone-${t}-ink`), c(`--tone-${t}-fill`)), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("badges: the info and neutral text (secondary) pass 4.5:1 on the page, the pane and the raised tier", () => {
    for (const k of ["--color-bg", "--color-pane", "--color-surface"]) {
      expect(ratio(c("--color-text-secondary"), c(k)), k).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("status-dot markers: every state marker passes 3:1 on the page and the pane", () => {
    // Mirrors the .status-dot rules in globals.css: sage done, clay stuck, amber warn, sky accent, stone and sand ctl.
    for (const k of ["--color-done", "--color-stuck", "--color-warn", "--color-accent", "--color-ctl"]) {
      for (const base of [bg(), c("--color-pane")]) {
        expect(ratio(c(k), base), k).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("new look core components: the rules are scoped and present", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf-8");

  it("buttons never wrap: .btn-* and Button are nowrap with a non-shrinking icon under the new look", () => {
    expect(section).toMatch(/\.btn-primary,[\s\S]*?\.btn-destructive \{[\s\S]*?white-space: nowrap;/);
    expect(section).toMatch(/\.btn-primary svg,[\s\S]*?flex-shrink: 0;/);
    const button = read("components/ui/button.tsx");
    expect(button).toContain("v2:whitespace-nowrap");
    expect(button).toContain("v2:[&_svg]:shrink-0");
  });

  it("the new look reaches the plain-CSS components: badge, status-dot, label and input", () => {
    for (const sel of [".badge-success", ".badge-danger", ".status-dot", ".label", ".input-field"]) {
      expect(section, sel).toContain(`[data-v2-scope] ${sel}`);
    }
  });

  it("form labels (<label class=label>) are 14/20; other .label elements stay 12/18", () => {
    expect(section).toMatch(/\[data-v2-scope\] \.label \{[^}]*font-size: 12px;/);
    expect(section).toMatch(/\[data-v2-scope\] label\.label \{[^}]*font-size: 14px;[^}]*line-height: 20px;/);
  });

  // Stage 2 (WS165): founder pages share the scope. The token blocks redefine every token Direction B's
  // founder block sets, so under the new look a founder page gets the new look's radii, shadows and fills.
  it("founder pages: the light block redefines every token Direction B's founder block sets", () => {
    const at = css.indexOf('[data-surface="founder"] {');
    const founder = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at)).replace(/\/\*[\s\S]*?\*\//g, "");
    const keys = [...founder.matchAll(/(--[a-z0-9-]+):/gi)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(LIGHT[k], `v2 light ${k}`).toBeTruthy();
  });

  it("founder pages: every Direction B component skin is put back under the new look", () => {
    const skins = css.slice(css.indexOf("Direction B component skins"), css.indexOf("LP portal print stylesheet"));
    for (const sel of [".status-dot {", ".tab-bar {", ".tab-bar .tab-link[aria-current=\"page\"] {", ".app-sidebar {", ".app-sidebar .nav-item[aria-current=\"page\"] {"]) {
      expect(skins, `B skin ${sel}`).toContain(`[data-surface="founder"] ${sel}`);
      expect(section, `v2 override ${sel}`).toContain(`html[data-look="v2"] [data-v2-scope][data-surface="founder"] ${sel}`);
    }
  });

  it("the empty state is a compact one-line state under the new look, with no icon or eyebrow", () => {
    const empty = read("components/ui/empty-state.tsx");
    expect(empty).toContain("v2:flex-row");
    expect(empty).toContain("v2:py-3");
    expect(empty).toMatch(/v2:hidden">\s*\{icon\}/);
    expect(empty).toMatch(/v2:hidden">\{eyebrow\}/);
  });
});

// WS167 (accessibility pass): the pairs the earlier suites did not name. WCAG 2.2 AA: text 4.5:1,
// UI parts, glyphs and focus indicators 3:1 (1.4.11). Disabled controls (opacity 0.5) are exempt from
// 1.4.3 and 1.4.11, so they are not asserted.
describe.each(THEMES)("new look WS167 pairs, %s theme", (_name, vars) => {
  const c = (k: string) => parse(vars[k]);
  const rootAt = css.indexOf(":root {");
  const rootBody = css.slice(css.indexOf("{", rootAt) + 1, css.indexOf("\n}", rootAt));
  const fromRoot = (k: string) => new RegExp(`${k}:\\s*([^;]+);`).exec(rootBody)![1].trim();
  const rgbVar = (k: string): RGBA => {
    const [r, g, b] = (vars[k] ?? fromRoot(k)).split(/\s+/).map(Number);
    return { r, g, b, a: 1 };
  };
  const bg = () => c("--color-bg");
  const surfaces: [string, RGBA][] = [
    ...["--color-bg", "--color-sidebar", "--color-pane", "--color-surface", "--color-well"].map((k): [string, RGBA] => [k, c(k)]),
    ["sel", over(c("--color-sel"), bg())],
    ["open", over(c("--color-open"), bg())],
    ["accent-soft (set chip)", over(c("--color-accent-soft"), bg())],
  ];

  it("the focus ring (2px accent outline or ring) passes 3:1 on every surface it can sit on", () => {
    for (const [name, s] of surfaces) expect(ratio(c("--color-accent"), s), name).toBeGreaterThanOrEqual(3);
    for (const t of ["stone", "sky", "sage", "clay", "sand", "amber"]) {
      expect(ratio(c("--color-accent"), c(`--tone-${t}-fill`)), `ring on tone ${t}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("placeholder text (muted) passes 4.5:1 inside a field (bg-card = surface) and on the page", () => {
    for (const k of ["--color-surface", "--color-bg", "--color-pane"]) {
      expect(ratio(c("--color-text-muted"), c(k)), k).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("destructive used as text (errors, Delete links) passes 4.5:1 on the page, the pane and the raised tier", () => {
    for (const k of ["--color-bg", "--color-pane", "--color-surface"]) {
      expect(ratio(rgbVar("--color-destructive-rgb"), c(k)), k).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("tone inks used as plain text (text-tone-*-ink with no fill) pass 4.5:1 on the page, the pane and the raised tier", () => {
    for (const t of ["stone", "sky", "sage", "clay", "sand", "amber"]) {
      for (const k of ["--color-bg", "--color-pane", "--color-surface"]) {
        expect(ratio(c(`--tone-${t}-ink`), c(k)), `${t} ink on ${k}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("the Sky mark (dots, insertion lines, toast bars) passes 3:1 on the page, the sidebar and the pane", () => {
    for (const k of ["--color-bg", "--color-sidebar", "--color-pane"]) {
      expect(ratio(c("--color-mark"), c(k)), k).toBeGreaterThanOrEqual(3);
    }
  });

  it("toasts: the text passes 4.5:1 on the toast, the close icon (ink at 70%) 3:1", () => {
    expect(ratio(c("--color-toast-ink"), c("--color-toast"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(over({ ...c("--color-toast-ink"), a: 0.7 }, c("--color-toast")), c("--color-toast"))).toBeGreaterThanOrEqual(3);
  });

  it("the active tab bar and the row cursor (accent) pass 3:1 against the hairline row they sit on", () => {
    expect(ratio(c("--color-accent"), bg())).toBeGreaterThanOrEqual(3);
    expect(ratio(c("--color-accent"), over(c("--color-open"), c("--color-pane")))).toBeGreaterThanOrEqual(3);
  });
});

describe("new look WS167: keyboard focus is drawn", () => {
  it("the shadow tokens Tailwind's shadow-* utilities read are never `none` (it voids the focus ring's box-shadow list)", () => {
    for (const k of ["--shadow-soft", "--shadow-lift", "--shadow-float"]) {
      expect(LIGHT[k], k).not.toMatch(/^none$/);
      if (DARK[k]) expect(DARK[k], `dark ${k}`).not.toMatch(/^none$/);
    }
  });

  it(".btn-* buttons and the segmented control draw a 2px accent outline on keyboard focus", () => {
    expect(section).toMatch(/\.btn-primary:focus-visible,[\s\S]*?\.btn-destructive:focus-visible \{\s*outline: 2px solid var\(--color-accent\);/);
    expect(section).toMatch(/\.seg button:focus-visible \{\s*outline: 2px solid var\(--color-accent\);/);
    expect(section).toMatch(/input\[type="checkbox"\]:focus-visible,[\s\S]*?input\[type="radio"\]:focus-visible \{\s*outline: 2px solid var\(--color-accent\);/);
  });
});

describe("new look WS167: placeholder text meets 4.5:1", () => {
  it("every faded placeholder (placeholder:text-*/NN) is put back to full muted under the new look, on the same line", () => {
    const root = join(__dirname, "..", "..");
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n);
        if (statSync(p).isDirectory()) return n === "__tests__" || n === "share" ? [] : walk(p);
        return /\.tsx$/.test(n) ? [p] : [];
      });
    const offenders: string[] = [];
    for (const f of [...walk(join(root, "app")), ...walk(join(root, "components"))]) {
      readFileSync(f, "utf-8").split("\n").forEach((line, i) => {
        if (/placeholder:text-[a-z-]+\/\d+/.test(line) && !line.includes("v2:placeholder:text-muted-foreground")) {
          offenders.push(`${f.slice(root.length + 1)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("new look WS167: dark-theme printing puts the light colours back (LP report and memo)", () => {
  const rootAt = css.indexOf(":root {");
  const rootBody = css.slice(css.indexOf("{", rootAt) + 1, css.indexOf("\n}", rootAt));
  function printBlock(selector: string): Record<string, string> {
    const at = section.indexOf(selector);
    expect(at, selector).toBeGreaterThan(0);
    const prevMedia = section.lastIndexOf("@media", at);
    expect(section.startsWith("@media print", prevMedia), `${selector} sits in @media print`).toBe(true);
    const open = section.indexOf("{", at);
    const body = section.slice(open + 1, section.indexOf("}", open)).replace(/\/\*[\s\S]*?\*\//g, "");
    const out: Record<string, string> = {};
    for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
    return out;
  }
  const lp = printBlock('html[data-look="v2"][data-theme="dark"] [data-v2-scope].lp-print-scope {');
  const memo = printBlock('html[data-look="v2"][data-theme="dark"] [data-v2-scope] .memo-print-scope {');
  // On paper every surface is white and hairlines are a step darker than on screen, on purpose.
  const PRINT_ONLY = new Set(["--color-border", "--color-surface", "--color-pane"]);

  it("the memo resets the same colours as the LP report", () => {
    expect(Object.keys(memo).sort()).toEqual(Object.keys(lp).sort());
  });

  it.each([
    ["LP report", lp],
    ["memo", memo],
  ])("%s: every reset value is the light theme's own value", (_n, block) => {
    expect(Object.keys(block).length).toBeGreaterThan(30);
    for (const [k, v] of Object.entries(block)) {
      if (PRINT_ONLY.has(k)) continue;
      const light = LIGHT[k] ?? new RegExp(`${k}:\\s*([^;]+);`).exec(rootBody)?.[1].trim();
      expect(v.toUpperCase(), k).toBe(String(light).toUpperCase());
    }
  });

  it("both reset every dark-theme text, state and tone colour (nothing dark can reach paper)", () => {
    const must = Object.keys(DARK).filter((k) => /^--(color-(text|done$|stuck$|warn$|accent$|mark|primary|destructive|ctl|bg$|surface|pane|well)|tone-)/.test(k));
    for (const block of [lp, memo]) for (const k of must) expect(block[k], k).toBeTruthy();
  });
});

describe("new look: type roles survive cn() (tailwind-merge sync)", () => {
  it("keeps text-row, text-meta and text-pane-title next to a colour class", () => {
    expect(cn("text-row", "text-foreground")).toBe("text-row text-foreground");
    expect(cn("text-meta", "text-muted-foreground")).toBe("text-meta text-muted-foreground");
    expect(cn("text-pane-title", "text-foreground")).toBe("text-pane-title text-foreground");
  });

  it("a later size replaces an earlier one", () => {
    expect(cn("text-row", "text-meta")).toBe("text-meta");
  });
});
