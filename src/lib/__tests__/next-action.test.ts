import { describe, it, expect } from "vitest";
import { nextFounderAction, STALE_AFTER_DAYS, type NextActionInput } from "../next-action";

const base: NextActionInput = { stage: "ACTIVE", diligence: null, updates: [], daysSinceLastUpdate: null };
const sent = (id: string) => ({ id, title: "Q3", status: "SENT" as const, createdAt: "2026-09-01T00:00:00Z" });

describe("nextFounderAction", () => {
  it("leads with unfinished diligence", () => {
    const a = nextFounderAction({ ...base, stage: "DILIGENCE", diligence: { done: 1, total: 3, completed: false } });
    expect(a.kind).toBe("diligence");
    expect(a.detail).toBe("1 of 3 required items done.");
    expect(a.href).toBe("/diligence");
  });

  it("does not nag once diligence is complete", () => {
    const a = nextFounderAction({ ...base, stage: "DILIGENCE", diligence: { done: 3, total: 3, completed: true } });
    expect(a.kind).toBe("first-update");
  });

  it("picks up the draft before anything about staleness", () => {
    const a = nextFounderAction({
      ...base,
      updates: [{ id: "d1", title: "Q4 draft", status: "DRAFT", createdAt: "2026-10-01T00:00:00Z" }, sent("s1")],
      daysSinceLastUpdate: 200,
    });
    expect(a.kind).toBe("draft");
    expect(a.href).toBe("/updates/d1");
    expect(a.detail).toContain("Q4 draft");
  });

  it("asks for a first update when there are none", () => {
    expect(nextFounderAction(base)).toMatchObject({ kind: "first-update", href: "/updates/new" });
  });

  it("nudges after the stale threshold and not before", () => {
    const at = nextFounderAction({ ...base, updates: [sent("s")], daysSinceLastUpdate: STALE_AFTER_DAYS });
    expect(at.kind).toBe("stale");
    expect(at.detail).toBe(`Your last update was ${STALE_AFTER_DAYS} days ago.`);
    const before = nextFounderAction({ ...base, updates: [sent("s")], daysSinceLastUpdate: STALE_AFTER_DAYS - 1 });
    expect(before.kind).toBe("up-to-date");
    expect(before.tone).toBe("calm");
  });

  it("words recent updates", () => {
    expect(nextFounderAction({ ...base, updates: [sent("s")], daysSinceLastUpdate: 0 }).detail).toBe("Your last update went out today.");
    expect(nextFounderAction({ ...base, updates: [sent("s")], daysSinceLastUpdate: 1 }).detail).toBe("Your last update was 1 day ago.");
  });
});
