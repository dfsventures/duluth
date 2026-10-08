import { describe, it, expect } from "vitest";
import {
  normalizeName,
  resolveEntity,
  planCardWrites,
  type Canonical,
  type ResolvedItem,
  type ExistingCardLite,
} from "@/lib/board-reconcile";

const people: Canonical[] = [
  { id: "p-jane", name: "Jane Founder", aliases: ["janey"], email: "jane@example.com" },
  { id: "p-sam", name: "Sam Partner", aliases: [], email: "sam@example.com" },
  { id: "p-jose", name: "José Founder", aliases: [] },
];

describe("normalizeName", () => {
  it("folds case, diacritics and punctuation", () => {
    expect(normalizeName("José")).toBe("jose");
    expect(normalizeName("  Jane   Founder. ")).toBe("jane founder");
    expect(normalizeName("Sam-Partner")).toBe("sam partner");
  });
});

describe("resolveEntity", () => {
  it("exact name match drops raw", () => {
    expect(resolveEntity("jane founder", null, people)).toEqual({
      id: "p-jane", raw: null, needsReview: false, via: "exact",
    });
  });
  it("matches diacritics vs plain", () => {
    expect(resolveEntity("jose founder", null, people).id).toBe("p-jose");
    expect(resolveEntity("José Founder", null, people).via).toBe("exact");
  });
  it("alias match keeps raw", () => {
    expect(resolveEntity("Janey", null, people)).toEqual({
      id: "p-jane", raw: "Janey", needsReview: false, via: "alias",
    });
  });
  it("attendee email match", () => {
    const r = resolveEntity("S. Partner", null, people, "SAM@example.com");
    expect(r).toEqual({ id: "p-sam", raw: "S. Partner", needsReview: false, via: "email" });
  });
  it("accepts a real claude id", () => {
    const r = resolveEntity("the partner", "p-sam", people);
    expect(r).toEqual({ id: "p-sam", raw: "the partner", needsReview: false, via: "claude" });
  });
  it("a hallucinated claude id becomes none and needs review", () => {
    expect(resolveEntity("Somebody", "p-ghost", people)).toEqual({
      id: null, raw: "Somebody", needsReview: true, via: "none",
    });
  });
  it("empty input is none without review", () => {
    expect(resolveEntity("  ", "p-sam", people)).toEqual({
      id: null, raw: null, needsReview: false, via: "none",
    });
    expect(resolveEntity(null, null, people).needsReview).toBe(false);
  });
});

function item(over: Partial<ResolvedItem> = {}): ResolvedItem {
  return {
    title: "AcmeHQ onboarding",
    sourceKey: "granola:n1:0",
    ownerId: "p-jane",
    rawOwnerName: null,
    projectId: "proj-acme",
    rawProjectName: null,
    dueDate: new Date("2026-11-01T00:00:00Z"),
    needsReview: false,
    ...over,
  };
}
function card(over: Partial<ExistingCardLite> = {}): ExistingCardLite {
  return { id: "c1", sourceKey: "granola:n1:0", humanEditedAt: null, ownerId: null, projectId: null, dueDate: null, ...over };
}

describe("planCardWrites", () => {
  it("creates when nothing matches", () => {
    const [p] = planCardWrites([item()], []);
    expect(p.action).toBe("create");
  });
  it("links to an open existingCardId without writing", () => {
    const [p] = planCardWrites([item({ existingCardId: "c9", sourceKey: null })], [card({ id: "c9", sourceKey: null })]);
    expect(p).toMatchObject({ action: "link", cardId: "c9" });
  });
  it("falls through to create when existingCardId is not an open card", () => {
    const [p] = planCardWrites([item({ existingCardId: "gone", sourceKey: null })], []);
    expect(p.action).toBe("create");
  });
  it("fills only null fields of an untouched card with the same sourceKey", () => {
    const [p] = planCardWrites([item()], [card({ ownerId: "p-sam" })]);
    expect(p.action).toBe("fill");
    if (p.action === "fill") {
      expect(p.fill.ownerId).toBeUndefined(); // already set, not overwritten
      expect(p.fill.projectId).toBe("proj-acme");
      expect(p.fill.dueDate).toEqual(new Date("2026-11-01T00:00:00Z"));
    }
  });
  it("never touches a humanEditedAt card", () => {
    const [p] = planCardWrites([item()], [card({ humanEditedAt: new Date() })]);
    expect(p).toMatchObject({ action: "skip", cardId: "c1", reason: "human-edited" });
  });
  it("skips a duplicate sourceKey inside one batch", () => {
    const plans = planCardWrites([item(), item()], []);
    expect(plans.map((p) => p.action)).toEqual(["create", "skip"]);
  });
  it("items without a sourceKey are always created", () => {
    const plans = planCardWrites([item({ sourceKey: null }), item({ sourceKey: null })], []);
    expect(plans.map((p) => p.action)).toEqual(["create", "create"]);
  });
});
