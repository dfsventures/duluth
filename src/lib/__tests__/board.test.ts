import { describe, it, expect } from "vitest";
import {
  positionBetween,
  needsRenormalize,
  parseDueDate,
  isBoardStatus,
  doneCutoff,
  DONE_VISIBLE_DAYS,
} from "@/lib/board";

describe("positionBetween", () => {
  it("returns the midpoint between two neighbours", () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });
  it("appends 1024 after the last card", () => {
    expect(positionBetween(3072, undefined)).toBe(4096);
  });
  it("prepends 1024 before the first card", () => {
    expect(positionBetween(undefined, 2048)).toBe(1024);
    expect(positionBetween(undefined, 500)).toBe(-524);
  });
  it("returns 1024 for an empty column", () => {
    expect(positionBetween()).toBe(1024);
  });
  it("treats 0 as a real position, not as missing", () => {
    expect(positionBetween(0, undefined)).toBe(1024);
    expect(positionBetween(undefined, 0)).toBe(-1024);
    expect(positionBetween(0, 10)).toBe(5);
  });
});

describe("needsRenormalize", () => {
  it("is true only when neighbours are closer than 1e-6", () => {
    expect(needsRenormalize(1, 1 + 1e-7)).toBe(true);
    expect(needsRenormalize(1, 1)).toBe(true);
    expect(needsRenormalize(1, 1.001)).toBe(false);
  });
});

describe("parseDueDate / isBoardStatus / doneCutoff", () => {
  it("parses date-only strings to 00:00 UTC", () => {
    expect(parseDueDate("2026-10-08")?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });
  it("returns null to clear and undefined for junk", () => {
    expect(parseDueDate(null)).toBeNull();
    expect(parseDueDate("")).toBeNull();
    expect(parseDueDate("10/08/2026")).toBeUndefined();
    expect(parseDueDate("2026-13-45")).toBeUndefined();
    expect(parseDueDate(5)).toBeUndefined();
  });
  it("validates statuses", () => {
    expect(isBoardStatus("DONE")).toBe(true);
    expect(isBoardStatus("done")).toBe(false);
  });
  it("cutoff is 14 days back", () => {
    const now = new Date("2026-10-15T00:00:00Z");
    expect(doneCutoff(now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(DONE_VISIBLE_DAYS).toBe(14);
  });
});
