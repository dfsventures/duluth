import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import * as look from "../founder-look";

// PLAN-1, WS165: founder screens in the new look. The old look must render exactly as before, so the
// shared founder class sets may only hold new-look utilities, and the phone rules that give founders
// 44px targets must exist and stay inside the founder scope.

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf-8");
const css = read("app/globals.css");

describe("founder-look class sets", () => {
  const sets = Object.entries(look).filter(([, v]) => typeof v === "string") as [string, string][];

  it("exports the class sets the founder pages use", () => {
    expect(sets.map(([k]) => k)).toEqual(
      expect.arrayContaining(["V2_LIST", "V2_ROW", "V2_PANEL", "V2_UNBOX", "V2_SECTIONS", "V2_FORM_BLOCK"])
    );
  });

  it.each(sets)("%s holds only new-look utilities (nothing reaches the old look)", (_name, classes) => {
    for (const c of classes.split(/\s+/).filter(Boolean)) {
      expect(c, c).toMatch(/^(?:(?:max-md|md):)?v2:/);
    }
  });
});

describe("founder phone rules (390px: 44px targets)", () => {
  const scope = 'html[data-look="v2"] [data-v2-scope][data-surface="founder"]';

  it("form fields are 44 high on founder phones", () => {
    expect(css).toContain(`${scope} .shell-page input.input-field`);
    expect(css).toContain(`${scope} .shell-page select.input-field`);
  });

  it("the Detail back link gets a 44px hit area that takes no extra room", () => {
    const at = css.indexOf(`${scope} .page-back {`);
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("height: 44px");
    expect(block).toContain("margin-block: -12px");
  });

  it("the founder phone rules sit inside a max-width 767px block", () => {
    const at = css.indexOf(`${scope} .rich-toolbar`);
    const media = css.lastIndexOf("@media (max-width: 767px)", at);
    expect(at).toBeGreaterThan(-1);
    expect(media).toBeGreaterThan(-1);
    // No closing brace at column 0 between the media query and the rule.
    expect(css.slice(media, at)).not.toMatch(/\n\}/);
  });
});

describe("founder dashboard", () => {
  const src = read("app/dashboard/page.tsx");

  it("keeps a single next action as the hero (exactly one next-action heading)", () => {
    expect((src.match(/id="next-action-heading"/g) ?? []).length).toBe(1);
  });

  it("the next action is the first section on the page and the only panel", () => {
    const hero = src.indexOf('aria-labelledby="next-action-heading"');
    expect(hero).toBeGreaterThan(-1);
    for (const id of ["from-dfs-heading", "recent-updates-heading", "investor-activity-heading"]) {
      expect(src.indexOf(`id="${id}"`)).toBeGreaterThan(hero);
    }
    expect((src.match(/\$\{V2_PANEL\}/g) ?? []).length).toBe(1);
  });
});
