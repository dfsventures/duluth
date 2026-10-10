import { describe, it, expect } from "vitest";
import {
  adjacentStatus,
  applyCardToPayload,
  countNeedsReview,
  createSequencer,
  initials,
  insertionIndex,
  isNoopMove,
  neighboursForIndex,
  undoTarget,
} from "../board-client";
import type { BoardCardData, BoardPayload } from "@/components/admin/board/types";

function card(over: Partial<BoardCardData>): BoardCardData {
  return {
    id: "c1",
    title: "Send AcmeHQ onboarding deck",
    notes: null,
    status: "TODO",
    position: 1,
    dueDate: null,
    projectId: null,
    ownerId: null,
    rawOwnerName: null,
    rawProjectName: null,
    needsReview: false,
    completedAt: null,
    archivedAt: null,
    updatedById: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

function payload(cards: BoardCardData[]): BoardPayload {
  return { cards, projects: [], people: [], needsReviewCount: countNeedsReview(cards) };
}

describe("applyCardToPayload", () => {
  it("clears the flag and recounts when an edit fixes owner/project", () => {
    const cur = payload([
      card({ id: "a", needsReview: true, rawOwnerName: "Jayne" }),
      card({ id: "b", needsReview: true, rawProjectName: "AcmeHQ onboring" }),
    ]);
    expect(cur.needsReviewCount).toBe(2);
    const next = applyCardToPayload(cur, card({ id: "a", needsReview: false, ownerId: "p1", rawOwnerName: null }));
    expect(next.needsReviewCount).toBe(1);
    expect(next.cards.find((c) => c.id === "a")?.needsReview).toBe(false);
    expect(next.cards.find((c) => c.id === "a")?.ownerId).toBe("p1");
  });

  it("removes archived cards and recounts", () => {
    const cur = payload([card({ id: "a", needsReview: true }), card({ id: "b" })]);
    const next = applyCardToPayload(cur, card({ id: "a", needsReview: true, archivedAt: "2026-10-02T00:00:00.000Z" }));
    expect(next.cards.map((c) => c.id)).toEqual(["b"]);
    expect(next.needsReviewCount).toBe(0);
  });

  it("appends a newly created card", () => {
    const next = applyCardToPayload(payload([card({ id: "a" })]), card({ id: "n", needsReview: true }));
    expect(next.cards).toHaveLength(2);
    expect(next.needsReviewCount).toBe(1);
  });

  it("does not mutate the input payload", () => {
    const cur = payload([card({ id: "a", needsReview: true })]);
    applyCardToPayload(cur, card({ id: "a", needsReview: false }));
    expect(cur.needsReviewCount).toBe(1);
    expect(cur.cards[0].needsReview).toBe(true);
  });
});

describe("createSequencer", () => {
  it("only the latest token is current", () => {
    const s = createSequencer();
    const a = s.next();
    const b = s.next();
    expect(s.isCurrent(a)).toBe(false);
    expect(s.isCurrent(b)).toBe(true);
  });

  it("invalidate() drops an in-flight load (optimistic move wins)", () => {
    const s = createSequencer();
    const t = s.next();
    s.invalidate();
    expect(s.isCurrent(t)).toBe(false);
  });
});


describe("insertionIndex", () => {
  it("lands before the first card whose midpoint is below the pointer", () => {
    const mids = [100, 200, 300];
    expect(insertionIndex(mids, 50)).toBe(0);
    expect(insertionIndex(mids, 150)).toBe(1);
    expect(insertionIndex(mids, 250)).toBe(2);
    expect(insertionIndex(mids, 999)).toBe(3);
  });
  it("is 0 for an empty column", () => {
    expect(insertionIndex([], 10)).toBe(0);
  });
});

describe("neighboursForIndex (the Part 37 move contract)", () => {
  const ids = ["a", "b", "c"];
  it("sends the card directly above as beforeId", () => {
    expect(neighboursForIndex(ids, 1)).toEqual({ beforeId: "a" });
    expect(neighboursForIndex(ids, 2)).toEqual({ beforeId: "b" });
  });
  it("at the very top sends the card below as afterId", () => {
    expect(neighboursForIndex(ids, 0)).toEqual({ afterId: "a" });
  });
  it("at the end sends the last card as beforeId; an empty column sends neither", () => {
    expect(neighboursForIndex(ids, 3)).toEqual({ beforeId: "c" });
    expect(neighboursForIndex([], 0)).toEqual({});
  });
  it("clamps an out-of-range index", () => {
    expect(neighboursForIndex(ids, 99)).toEqual({ beforeId: "c" });
    expect(neighboursForIndex(ids, -4)).toEqual({ afterId: "a" });
  });
});

describe("isNoopMove", () => {
  const col = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("is true when dropped back into its own slot", () => {
    // Dragging b: the column without b is [a, c]; index 1 is b's own place.
    expect(isNoopMove(col, "b", "TODO", "TODO", 1)).toBe(true);
  });
  it("is false for a different slot or column", () => {
    expect(isNoopMove(col, "b", "TODO", "TODO", 0)).toBe(false);
    expect(isNoopMove(col, "b", "TODO", "TODO", 2)).toBe(false);
    expect(isNoopMove(col, "b", "DONE", "TODO", 1)).toBe(false);
  });
});

describe("undoTarget", () => {
  const cols = {
    TODO: [{ id: "a" }, { id: "b" }, { id: "c" }],
    IN_PROGRESS: [{ id: "d" }],
    BLOCKED: [],
    DONE: [{ id: "e" }, { id: "f" }],
  };
  it("puts a card back under its old upper neighbour", () => {
    expect(undoTarget(cols, "b")).toEqual({ status: "TODO", beforeId: "a" });
  });
  it("uses the lower neighbour when it was on top", () => {
    expect(undoTarget(cols, "a")).toEqual({ status: "TODO", afterId: "b" });
    expect(undoTarget(cols, "e")).toEqual({ status: "DONE", afterId: "f" });
  });
  it("uses just the column when it was alone", () => {
    expect(undoTarget(cols, "d")).toEqual({ status: "IN_PROGRESS" });
  });
  it("returns null for an unknown card", () => {
    expect(undoTarget(cols, "zzz")).toBeNull();
  });
});

describe("adjacentStatus / initials", () => {
  it("steps along the columns and stops at the edges", () => {
    expect(adjacentStatus("TODO", "right")).toBe("IN_PROGRESS");
    expect(adjacentStatus("TODO", "left")).toBeNull();
    expect(adjacentStatus("DONE", "right")).toBeNull();
    expect(adjacentStatus("BLOCKED", "left")).toBe("IN_PROGRESS");
  });
  it("makes one or two initials", () => {
    expect(initials("Jane Founder")).toBe("JF");
    expect(initials("sam")).toBe("S");
    expect(initials("A B C")).toBe("AB");
    expect(initials(null)).toBe("?");
    expect(initials("  ")).toBe("?");
  });
});
