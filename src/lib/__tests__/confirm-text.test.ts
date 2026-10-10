import { describe, it, expect } from "vitest";
import { matchesConfirmText } from "../confirm-text";

describe("matchesConfirmText", () => {
  it("matches exactly, ignoring case and surrounding space", () => {
    expect(matchesConfirmText("Acme LP", "Acme LP")).toBe(true);
    expect(matchesConfirmText("  acme lp ", "Acme LP")).toBe(true);
  });
  it("rejects partial or different text", () => {
    expect(matchesConfirmText("Acme", "Acme LP")).toBe(false);
    expect(matchesConfirmText("", "Acme LP")).toBe(false);
  });
  it("never unlocks against an empty expectation", () => {
    expect(matchesConfirmText("", "")).toBe(false);
    expect(matchesConfirmText("  ", "  ")).toBe(false);
  });
});
