import { describe, it, expect } from "vitest";
import { applyCardToPayload, countNeedsReview, createSequencer } from "../board-client";
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
