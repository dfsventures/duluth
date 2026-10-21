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
