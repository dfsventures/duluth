import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { collapseDelay } from "../row-collapse";

// PLAN-1 WS167: under prefers-reduced-motion the new look's motion is instant: the side pane's slide,
// the slim bar's slide, row fades and collapses, toasts, dialogs and sheets. All of it is CSS (keyframes
// in tailwind.config.ts, transitions in globals.css), so one unlayered !important rule zeroes it; the
// two pieces that run in script (row removal, section jumps) check the setting themselves.

const SRC = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(SRC, f), "utf-8");
const css = read("app/globals.css");
const tailwind = readFileSync(join(SRC, "..", "tailwind.config.ts"), "utf-8");

/** Every top-level `@media (prefers-reduced-motion: reduce) { ... }` block, with its start offset. */
function reducedBlocks(): { at: number; body: string }[] {
  const out: { at: number; body: string }[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf("@media (prefers-reduced-motion: reduce)", from);
    if (at < 0) return out;
    const open = css.indexOf("{", at);
    let depth = 0;
    let end = open;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    out.push({ at, body: css.slice(open + 1, end) });
    from = end;
  }
}

/** The [start, end) ranges of the @layer blocks: a rule inside one loses to unlayered utilities. */
function layerRanges(): [number, number][] {
  const out: [number, number][] = [];
  for (const m of css.matchAll(/^@layer [a-z]+ \{/gm)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) {
        out.push([m.index!, i]);
        break;
      }
    }
  }
  return out;
}

describe("reduced motion (WS167)", () => {
  const global = reducedBlocks().find((b) => /\*,\s*\*::before,\s*\*::after\s*\{/.test(b.body));

  it("one global rule zeroes every animation and transition, and stops smooth scrolling", () => {
    expect(global).toBeDefined();
    expect(global!.body).toMatch(/animation-duration:\s*0\.01ms !important/);
    expect(global!.body).toMatch(/animation-iteration-count:\s*1 !important/);
    expect(global!.body).toMatch(/transition-duration:\s*0\.01ms !important/);
    expect(global!.body).toMatch(/scroll-behavior:\s*auto !important/);
  });

  it("the global rule is unlayered, so no Tailwind utility (v2:[animation-duration:160ms] and the like) can beat it", () => {
    for (const [start, end] of layerRanges()) {
      expect(global!.at < start || global!.at > end).toBe(true);
    }
  });

  it("the pane slide, toasts, row fades, dialogs and sheets are CSS keyframe animations (so the rule reaches them)", () => {
    for (const name of ["pane-in", "toast-in", "toast-out", "row-fade", "row-out", "dialog-in", "dialog-out", "sheet-in", "sheet-out", "overlay-in", "overlay-out", "land"]) {
      expect(tailwind, `keyframes ${name}`).toMatch(new RegExp(`["']?${name}["']?:\\s*\\{`));
      expect(tailwind, `animation ${name}`).toMatch(new RegExp(`["']?${name}["']?:\\s*"${name} `));
    }
    expect(read("components/layout/split-view.tsx")).toContain("animate-pane-in");
    expect(read("components/ui/toaster.tsx")).toMatch(/animate-toast-in[\s\S]*animate-toast-out/);
  });

  it("the slim (condensed) bar slides by transition and drops its offset under reduced motion", () => {
    expect(css).toMatch(/\.condensed-bar \{[^}]*transition: opacity 140ms[^}]*transform 140ms/);
    const own = reducedBlocks().find((b) => b.body.includes(".condensed-bar"));
    expect(own, "a reduced-motion block for the slim bar").toBeDefined();
    expect(own!.body).toMatch(/\.condensed-bar\[data-shown="false"\] \{\s*transform: none;/);
  });

  it("the mobile drawer and nav items turn their transitions off; a landed card shows an outline instead of moving", () => {
    expect(read("components/layout/sidebar.tsx").match(/motion-reduce:transition-none/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const f of ["components/admin/board/board-card.tsx", "components/admin/memos/memo-board-card.tsx"]) {
      expect(read(f), f).toContain("animate-land motion-reduce:outline");
    }
  });

  it("script-driven motion checks the setting: row removal waits 0ms, section jumps don't smooth-scroll", () => {
    expect(collapseDelay(true)).toBe(0);
    expect(collapseDelay(false)).toBeGreaterThan(0);
    const nav = read("components/admin/memos/dossier-nav.tsx");
    expect(nav).toContain('behavior: prefersReducedMotion() ? "auto" : "smooth"');
  });
});
