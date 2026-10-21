import { describe, it, expect } from "vitest";
import {
  COLLAPSED_BY_DEFAULT,
  COLUMN_LABELS,
  DECISION_COLUMNS,
  adjacentColumn,
  applyDecision,
  columnOf,
  decisionOf,
  groupByDecision,
  resolveView,
  boardTime,
  isIdle,
  landingIndex,
  moveTargets,
  sameName,
  summaryCounts,
  tagLine,
} from "@/lib/memo-board";

// Part 43 (WS142): the pure half of the memo board.
const row = (id: string, decision: any, updatedAt: string, version = 1) => ({ id, decision, updatedAt, version });

describe("groupByDecision", () => {
  it("returns every column in order, nulls under NONE, newest first", () => {
    const g = groupByDecision([
      row("a", "MEMO", "2026-01-01T00:00:00Z"),
      row("b", null, "2026-01-02T00:00:00Z"),
      row("c", "MEMO", "2026-03-01T00:00:00Z"),
      row("d", null, "2026-02-01T00:00:00Z"),
    ]);
    expect(Object.keys(g)).toEqual(["IN_PROGRESS", "MEMO", "INVESTED", "LATER", "PASSED", "NONE"]);
    expect(g.MEMO.map((r) => r.id)).toEqual(["c", "a"]);
    expect(g.NONE.map((r) => r.id)).toEqual(["d", "b"]);
    expect(g.PASSED).toEqual([]);
  });
});

describe("resolveView", () => {
  it("the param wins, then the stored value, then board; junk is ignored", () => {
    expect(resolveView("list", "board")).toBe("list");
    expect(resolveView(null, "list")).toBe("list");
    expect(resolveView(null, null)).toBe("board");
    expect(resolveView("grid", "list")).toBe("list");
    expect(resolveView("grid", "nope")).toBe("board");
    expect(resolveView("", "")).toBe("board");
  });
});

describe("applyDecision", () => {
  const rows = [row("a", "MEMO", "x", 1), row("b", null, "x", 4)];
  it("changes only the decision without a version", () => {
    const out = applyDecision(rows, "a", "INVESTED");
    expect(out[0]).toMatchObject({ decision: "INVESTED", version: 1 });
    expect(out[1]).toBe(rows[1]);
    expect(rows[0].decision).toBe("MEMO"); // input untouched
  });
  it("sets the version when the server answers, and can clear", () => {
    expect(applyDecision(rows, "b", "LATER", 5)[1]).toMatchObject({ decision: "LATER", version: 5 });
    expect(applyDecision(rows, "a", null)[0].decision).toBeNull();
  });
});

describe("columns", () => {
  it("adjacentColumn stops at both edges", () => {
    expect(adjacentColumn("IN_PROGRESS", "left")).toBeNull();
    expect(adjacentColumn("NONE", "right")).toBeNull();
    expect(adjacentColumn("MEMO", "left")).toBe("IN_PROGRESS");
    expect(adjacentColumn("PASSED", "right")).toBe("NONE");
  });
  it("labels, defaults and conversions", () => {
    expect(COLUMN_LABELS.NONE).toBe("Unsorted");
    expect(COLUMN_LABELS.IN_PROGRESS).toBe("Evaluating");
    expect(COLUMN_LABELS.MEMO).toBe("Writing memo");
    expect(DECISION_COLUMNS.at(-1)).toBe("NONE");
    expect(COLLAPSED_BY_DEFAULT).toEqual(["PASSED"]);
    expect(columnOf(null)).toBe("NONE");
    expect(decisionOf("NONE")).toBeNull();
    expect(decisionOf("PASSED")).toBe("PASSED");
  });
});

describe("Part 44 helpers", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  it("isIdle: Writing memo / Evaluating at 14 days, not 13; other stages and null never", () => {
    expect(isIdle({ decision: "MEMO", updatedAt: ago(14) }, now)).toBe(true);
    expect(isIdle({ decision: "IN_PROGRESS", updatedAt: ago(20) }, now)).toBe(true);
    expect(isIdle({ decision: "MEMO", updatedAt: ago(13) }, now)).toBe(false);
    expect(isIdle({ decision: "INVESTED", updatedAt: ago(60) }, now)).toBe(false);
    expect(isIdle({ decision: null, updatedAt: ago(60) }, now)).toBe(false);
  });

  it("boardTime: relative, then weeks, then a date (year only when not this year)", () => {
    expect(boardTime(ago(3), now)).toBe("3 d ago");
    expect(boardTime(ago(20), now)).toBe("2 wk ago");
    expect(boardTime(ago(30), now)).toBe("4 wk ago");
    const same = boardTime(ago(45), now);
    expect(same).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(boardTime("2025-08-13T12:00:00Z", now)).toMatch(/2025$/);
  });

  it("sameName ignores case and spaces, not extra words, and is false for nulls", () => {
    expect(sameName("Acme", " acme ")).toBe(true);
    expect(sameName("Acme", "Acme AI")).toBe(false);
    expect(sameName(null, "Acme")).toBe(false);
    expect(sameName("Acme", undefined)).toBe(false);
  });

  it("tagLine shows two and counts the rest", () => {
    expect(tagLine(["AI", "Payments", "Fintech", "Seed"])).toEqual({ text: "AI · Payments", more: 2 });
    expect(tagLine([])).toEqual({ text: "", more: 0 });
  });

  it("moveTargets lists the five other columns", () => {
    const t = moveTargets("MEMO");
    expect(t).toHaveLength(5);
    expect(t).not.toContain("MEMO");
  });

  it("landingIndex counts newer cards and ignores the dragged card", () => {
    const cards = [
      { id: "a", updatedAt: "2026-10-05T00:00:00Z" },
      { id: "b", updatedAt: "2026-10-03T00:00:00Z" },
      { id: "c", updatedAt: "2026-10-01T00:00:00Z" },
    ];
    expect(landingIndex(cards, { id: "x", updatedAt: "2026-10-04T00:00:00Z" })).toBe(1);
    expect(landingIndex(cards, { id: "x", updatedAt: "2026-10-09T00:00:00Z" })).toBe(0);
    expect(landingIndex(cards, { id: "x", updatedAt: "2026-09-01T00:00:00Z" })).toBe(3);
    expect(landingIndex(cards, { id: "b", updatedAt: "2026-10-03T00:00:00Z" })).toBe(1);
  });

  it("summaryCounts totals, in review and idle", () => {
    const rows = [
      { status: "IN_REVIEW", decision: "MEMO" as const, updatedAt: ago(20) },
      { status: "DRAFT", decision: "INVESTED" as const, updatedAt: ago(90) },
      { status: "FINAL", decision: null, updatedAt: ago(1) },
    ];
    expect(summaryCounts(rows, now)).toEqual({ total: 3, inReview: 1, idle: 1 });
  });
});
