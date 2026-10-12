import { describe, it, expect } from "vitest";
import {
  normalizeName,
  resolveEntity,
  planCardWrites,
  legacyOwnerFields,
  computeNeedsReview,
  fromSingleOwner,
  resolveOwners,
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
    ownerIds: ["p-jane"],
    ownerRawNames: {},
    unmatchedOwnerNames: [],
    projectId: "proj-acme",
    rawProjectName: null,
    dueDate: new Date("2026-11-01T00:00:00Z"),
    needsReview: false,
    ...over,
  };
}
function card(over: Partial<ExistingCardLite> = {}): ExistingCardLite {
  return { id: "c1", sourceKey: "granola:n1:0", humanEditedAt: null, ownerIds: [], projectId: null, dueDate: null, ...over };
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
    const [p] = planCardWrites([item()], [card({ ownerIds: ["p-sam"] })]);
    expect(p.action).toBe("fill");
    if (p.action === "fill") {
      expect(p.fill.ownerIds).toBeUndefined(); // already set, not overwritten
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

describe("planCardWrites owner fill (JC-MO-G)", () => {
  it("fills owners when the untouched card has none", () => {
    const [p] = planCardWrites([item({ ownerRawNames: { "p-jane": "Janey" } })], [card()]);
    expect(p.action === "fill" && p.fill.ownerIds).toEqual(["p-jane"]);
    expect(p.action === "fill" && p.fill.ownerRawNames).toEqual({ "p-jane": "Janey" });
  });
  it("never fills owners onto a card that already has some", () => {
    const [p] = planCardWrites([item()], [card({ ownerIds: ["p-sam"] })]);
    expect(p.action === "fill" && p.fill.ownerIds).toBeUndefined();
  });
});

describe("legacyOwnerFields (JC-MO-D)", () => {
  it("uses the first owner and its raw name", () => {
    expect(legacyOwnerFields(["a", "b"], { a: "Janey" }, ["x"])).toEqual({ ownerId: "a", rawOwnerName: "Janey" });
    expect(legacyOwnerFields(["a"], {}, [])).toEqual({ ownerId: "a", rawOwnerName: null });
  });
  it("falls back to the first unmatched name", () => {
    expect(legacyOwnerFields([], {}, ["Sam", "Ghost"])).toEqual({ ownerId: null, rawOwnerName: "Sam" });
  });
  it("is empty with nothing", () => {
    expect(legacyOwnerFields([], {}, [])).toEqual({ ownerId: null, rawOwnerName: null });
  });
});

describe("computeNeedsReview (F117)", () => {
  it("flags an unmatched owner name", () => {
    expect(computeNeedsReview({ unmatchedOwnerNames: ["Sam"], rawProjectName: null, projectId: null })).toBe(true);
  });
  it("flags a raw project with no project id", () => {
    expect(computeNeedsReview({ unmatchedOwnerNames: [], rawProjectName: "Acme", projectId: null })).toBe(true);
  });
  it("does not flag an alias-matched project (raw kept, id set)", () => {
    expect(computeNeedsReview({ unmatchedOwnerNames: [], rawProjectName: "Acme", projectId: "pr1" })).toBe(false);
  });
});

describe("fromSingleOwner", () => {
  it("maps resolved, unmatched and empty", () => {
    expect(fromSingleOwner({ id: "a", raw: "Janey" })).toEqual({ ownerIds: ["a"], ownerRawNames: { a: "Janey" }, unmatchedOwnerNames: [] });
    expect(fromSingleOwner({ id: null, raw: "Sam" })).toEqual({ ownerIds: [], ownerRawNames: {}, unmatchedOwnerNames: ["Sam"] });
    expect(fromSingleOwner({ id: null, raw: null })).toEqual({ ownerIds: [], ownerRawNames: {}, unmatchedOwnerNames: [] });
  });
});

describe("resolveOwners (Part 38)", () => {
  it("resolves exact, alias and email matches and keeps unmatched names apart", () => {
    const r = resolveOwners(
      [
        { raw: "Jane Founder", id: null }, // exact
        { raw: "janey", id: null }, // alias of the same person: collapses (JC-MO-L)
        { raw: "Sammy", id: null }, // matched through the attendee email hint
        { raw: "Zed Unknown", id: null }, // unmatched
      ],
      people,
      (raw) => (raw === "Sammy" ? "sam@example.com" : null)
    );
    expect(r.ownerIds).toEqual(["p-jane", "p-sam"]);
    expect(r.ownerRawNames).toEqual({ "p-jane": null, "p-sam": "Sammy" });
    expect(r.unmatchedOwnerNames).toEqual(["Zed Unknown"]);
  });

  it("accepts Claude's id guess only for a real canonical id", () => {
    const r = resolveOwners([{ raw: "S. Partner", id: "p-sam" }, { raw: "Q", id: "invented" }], people);
    expect(r.ownerIds).toEqual(["p-sam"]);
    expect(r.unmatchedOwnerNames).toEqual(["Q"]);
  });

  it("the same unmatched name heard twice is kept once", () => {
    const r = resolveOwners([{ raw: "Zed", id: null }, { raw: "zed.", id: null }], people);
    expect(r.unmatchedOwnerNames).toEqual(["Zed"]);
  });

  it("counts unmatched names toward the cap of 5", () => {
    const r = resolveOwners(
      ["Jane Founder", "Sam Partner", "A", "B", "C", "D"].map((raw) => ({ raw, id: null })),
      people
    );
    expect(r.ownerIds.length + r.unmatchedOwnerNames.length).toBe(5);
    expect(r.unmatchedOwnerNames).toEqual(["A", "B", "C"]);
  });

  it("returns empty sets for no input", () => {
    expect(resolveOwners([], people)).toEqual({ ownerIds: [], ownerRawNames: {}, unmatchedOwnerNames: [] });
  });
});
