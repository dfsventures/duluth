import { describe, it, expect } from "vitest";
import { parseOwnerInput, MAX_OWNERS_PER_CARD } from "../board";

describe("parseOwnerInput (Part 38)", () => {
  it("reports an absent field as undefined", () => {
    expect(parseOwnerInput({ title: "x" })).toEqual({ ok: true, ownerIds: undefined });
  });

  it("maps the legacy ownerId string to a one-element array", () => {
    expect(parseOwnerInput({ ownerId: "p1" })).toEqual({ ok: true, ownerIds: ["p1"] });
  });

  it("maps legacy null and empty string to an empty array", () => {
    expect(parseOwnerInput({ ownerId: null })).toEqual({ ok: true, ownerIds: [] });
    expect(parseOwnerInput({ ownerId: "" })).toEqual({ ok: true, ownerIds: [] });
  });

  it("rejects a non-string legacy ownerId", () => {
    expect(parseOwnerInput({ ownerId: 7 })).toEqual({ ok: false, error: "Unknown owner" });
  });

  it("collapses duplicate ids in an array", () => {
    expect(parseOwnerInput({ ownerIds: ["p1", "p2", "p1"] })).toEqual({ ok: true, ownerIds: ["p1", "p2"] });
  });

  it("accepts an empty array (clear all owners)", () => {
    expect(parseOwnerInput({ ownerIds: [] })).toEqual({ ok: true, ownerIds: [] });
  });

  it("accepts exactly the cap and rejects one more", () => {
    const five = Array.from({ length: MAX_OWNERS_PER_CARD }, (_, i) => `p${i}`);
    expect(parseOwnerInput({ ownerIds: five })).toEqual({ ok: true, ownerIds: five });
    const six = [...five, "p9"];
    const r = parseOwnerInput({ ownerIds: six });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/at most 5 owners/);
  });

  it("rejects both fields at once", () => {
    const r = parseOwnerInput({ ownerId: "p1", ownerIds: ["p2"] });
    expect(r.ok).toBe(false);
  });

  it("rejects non-string and empty entries, and a non-array", () => {
    expect(parseOwnerInput({ ownerIds: ["p1", 2] }).ok).toBe(false);
    expect(parseOwnerInput({ ownerIds: ["p1", ""] }).ok).toBe(false);
    expect(parseOwnerInput({ ownerIds: "p1" }).ok).toBe(false);
  });
});
