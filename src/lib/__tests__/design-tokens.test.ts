import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { TONES, statusTone, type Tone } from "../status-tone";

// UI overhaul phase 1: re-check every colour pair the new tokens introduce
// against WCAG AA (4.5:1 for normal text), and keep status-tone.ts in lockstep
// with the CSS custom properties.

function lum(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf-8");
function cssVar(name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`missing ${name}`);
  return m[1].toUpperCase();
}

const PAPER = "#EBE8DE";
const WHITE = "#FFFFFF";
const OBSIDIAN = "#14140F";
const MUTED = "#66645A";

describe("design tokens", () => {
  (Object.keys(TONES) as Tone[]).forEach((tone) => {
    it(`${tone}: ink on fill, white and Paper all pass AA`, () => {
      const { fill, ink } = TONES[tone];
      expect(contrast(fill, ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(WHITE, ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(PAPER, ink)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tone}: matches the CSS custom properties`, () => {
      expect(cssVar(`--tone-${tone}-fill`)).toBe(TONES[tone].fill.toUpperCase());
      expect(cssVar(`--tone-${tone}-ink`)).toBe(TONES[tone].ink.toUpperCase());
    });
  });

  it("muted text passes AA on every surface tier it sits on", () => {
    for (const bg of [PAPER, WHITE, cssVar("--color-well"), cssVar("--color-row-hover"), TONES.stone.fill]) {
      expect(contrast(bg, MUTED)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("Obsidian on solid Ochre (nav count pills) passes AA", () => {
    expect(contrast("#C9963A", OBSIDIAN)).toBeGreaterThanOrEqual(4.5);
  });

  it("primary button text and destructive button text pass AA", () => {
    expect(contrast("#44688E", WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#3A5876", WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#8F4A30", WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("toast (Obsidian) text and action pass AA", () => {
    expect(contrast(OBSIDIAN, PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(OBSIDIAN, "#A9CCE8")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("statusTone", () => {
  it("maps cadence statuses, never marking never-happened as clay", () => {
    expect(statusTone("BEHIND")).toBe("clay");
    expect(statusTone("aging")).toBe("amber");
    expect(statusTone("CURRENT")).toBe("sage");
    expect(statusTone("NEW")).toBe("sky");
  });
  it("maps board columns and stages", () => {
    expect(statusTone("To do")).toBe("stone");
    expect(statusTone("In progress")).toBe("sky");
    expect(statusTone("Blocked")).toBe("clay");
    expect(statusTone("Done")).toBe("sage");
    expect(statusTone("Pre-seed")).toBe("sand");
    expect(statusTone("Series A")).toBe("sage");
  });
  it("falls back to stone", () => {
    expect(statusTone(null)).toBe("stone");
    expect(statusTone("something else")).toBe("stone");
  });
});
