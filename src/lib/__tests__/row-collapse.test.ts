import { describe, expect, it } from "vitest";
import { COLLAPSE_MS, collapseDelay } from "@/lib/row-collapse";

describe("collapseDelay", () => {
  it("is 200ms normally and 0 under reduced motion", () => {
    expect(COLLAPSE_MS).toBe(200);
    expect(collapseDelay(false)).toBe(200);
    expect(collapseDelay(true)).toBe(0);
  });
});
