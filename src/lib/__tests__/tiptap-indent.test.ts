import { describe, it, expect } from "vitest";
import { nextIndentLevel, indentLevelFromMarginLeft, MAX_INDENT, REM_PER_LEVEL } from "@/lib/tiptap-indent";

describe("nextIndentLevel", () => {
  it("increases by the given delta", () => {
    expect(nextIndentLevel(0, 1)).toBe(1);
    expect(nextIndentLevel(2, 1)).toBe(3);
  });

  it("decreases by the given delta", () => {
    expect(nextIndentLevel(3, -1)).toBe(2);
  });

  it("floors at 0 — never negative", () => {
    expect(nextIndentLevel(0, -1)).toBe(0);
  });

  it("caps at MAX_INDENT", () => {
    expect(nextIndentLevel(MAX_INDENT, 1)).toBe(MAX_INDENT);
    expect(nextIndentLevel(MAX_INDENT - 1, 1)).toBe(MAX_INDENT);
  });
});

describe("indentLevelFromMarginLeft", () => {
  // element.style.marginLeft on a DOMParser-parsed detached element preserves
  // the unit as authored ("4rem", not resolved to px) — verified directly in
  // headless Chrome against TipTap's actual parsing path before writing this.
  it("recovers the level from a rendered margin-left (rem, as authored)", () => {
    expect(indentLevelFromMarginLeft(`${REM_PER_LEVEL}rem`)).toBe(1);
    expect(indentLevelFromMarginLeft(`${REM_PER_LEVEL * 3}rem`)).toBe(3);
  });

  it("returns 0 for no margin, empty string, or non-positive values", () => {
    expect(indentLevelFromMarginLeft("")).toBe(0);
    expect(indentLevelFromMarginLeft("0rem")).toBe(0);
  });
});
