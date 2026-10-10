import { describe, it, expect } from "vitest";
import { buildAttention, SEVERE_OVERDUE_DAYS, type AttentionInput } from "../attention";

const empty: AttentionInput = { pendingApprovals: 0, diligenceReady: 0, boardReview: 0, alerts: [], overdue: [] };

describe("buildAttention", () => {
  it("is empty when nothing needs anyone", () => {
    expect(buildAttention(empty)).toEqual([]);
  });

  it("orders queues, then alerts, then overdue", () => {
    const items = buildAttention({
      pendingApprovals: 3,
      diligenceReady: 1,
      boardReview: 2,
      alerts: [{ id: "a1", message: "Revenue dropped 20%", firedAt: "2026-10-01T00:00:00Z", company: { id: "c1", name: "AcmeHQ" } }],
      overdue: [{ id: "c2", name: "Kora Freight", daysSinceUpdate: 40 }],
    });
    expect(items.map((i) => i.kind)).toEqual(["approvals", "diligence", "board", "alert", "overdue"]);
  });

  it("words singular and plural correctly", () => {
    const one = buildAttention({ ...empty, pendingApprovals: 1, diligenceReady: 1, boardReview: 1 });
    expect(one.map((i) => i.title)).toEqual([
      "1 signup is waiting for approval",
      "1 company is ready for diligence review",
      "1 board item needs review",
    ]);
    const many = buildAttention({ ...empty, pendingApprovals: 2, diligenceReady: 2, boardReview: 2 });
    expect(many.map((i) => i.title)).toEqual([
      "2 signups are waiting for approval",
      "2 companies are ready for diligence review",
      "2 board items need review",
    ]);
  });

  it("sorts alerts newest first and names the company", () => {
    const items = buildAttention({
      ...empty,
      alerts: [
        { id: "old", message: "m1", firedAt: "2026-09-01T00:00:00Z", company: { id: "c1", name: "A" } },
        { id: "new", message: "m2", firedAt: "2026-10-01T00:00:00Z", company: { id: "c2", name: "B" } },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["alert:new", "alert:old"]);
    expect(items[0].title).toBe("B: m2");
    expect(items[0].action).toBe("dismiss");
  });

  it("puts never-updated companies first, then the longest overdue, with severity tone", () => {
    const items = buildAttention({
      ...empty,
      overdue: [
        { id: "a", name: "A", daysSinceUpdate: 45 },
        { id: "b", name: "B", daysSinceUpdate: SEVERE_OVERDUE_DAYS + 1 },
        { id: "c", name: "C", daysSinceUpdate: null },
      ],
    });
    expect(items.map((i) => i.companyId)).toEqual(["c", "b", "a"]);
    expect(items.map((i) => i.tone)).toEqual(["clay", "clay", "amber"]);
    expect(items[0].detail).toBe("No update sent yet");
    expect(items[2].detail).toBe("Last update 45 days ago");
    expect(items.every((i) => i.action === "remind")).toBe(true);
  });

  it("gives every item a unique id", () => {
    const items = buildAttention({
      pendingApprovals: 1,
      diligenceReady: 1,
      boardReview: 1,
      alerts: [{ id: "x", message: "m", firedAt: "2026-10-01T00:00:00Z", company: { id: "x", name: "X" } }],
      overdue: [{ id: "x", name: "X", daysSinceUpdate: 70 }],
    });
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});
