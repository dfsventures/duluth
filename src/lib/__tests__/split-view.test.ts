import { describe, expect, it } from "vitest";
import { buildOpenQuery, crumbLabel, escapeBelongsToField, nextAfterRemoval, parseOpenParam, stepCursor } from "../split-view";

describe("escapeBelongsToField", () => {
  it("keeps Esc for text fields", () => {
    expect(escapeBelongsToField({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(escapeBelongsToField({ tagName: "INPUT" })).toBe(true);
    expect(escapeBelongsToField({ tagName: "INPUT", type: "search" })).toBe(true);
    expect(escapeBelongsToField({ tagName: "TEXTAREA" })).toBe(true);
    expect(escapeBelongsToField({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
  it("keeps Esc for anything inside a dialog, menu or the palette", () => {
    expect(escapeBelongsToField({ tagName: "BUTTON", closest: () => ({}) })).toBe(true);
  });
  it("lets Esc close the pane from a select, checkbox, radio or button", () => {
    expect(escapeBelongsToField({ tagName: "SELECT", closest: () => null })).toBe(false);
    expect(escapeBelongsToField({ tagName: "INPUT", type: "checkbox", closest: () => null })).toBe(false);
    expect(escapeBelongsToField({ tagName: "INPUT", type: "radio", closest: () => null })).toBe(false);
    expect(escapeBelongsToField({ tagName: "BUTTON", closest: () => null })).toBe(false);
    expect(escapeBelongsToField(null)).toBe(false);
  });
});

describe("parseOpenParam", () => {
  it("returns the id, trimmed", () => {
    expect(parseOpenParam("c1")).toBe("c1");
    expect(parseOpenParam("  c1 ")).toBe("c1");
  });
  it("returns null for missing, blank or oversized values", () => {
    expect(parseOpenParam(null)).toBeNull();
    expect(parseOpenParam(undefined)).toBeNull();
    expect(parseOpenParam("")).toBeNull();
    expect(parseOpenParam("   ")).toBeNull();
    expect(parseOpenParam("x".repeat(201))).toBeNull();
  });
});

describe("buildOpenQuery", () => {
  it("sets open and keeps the table's own params", () => {
    expect(buildOpenQuery(new URLSearchParams("filter=behind&sort=-name"), "c1")).toBe("?filter=behind&sort=-name&open=c1");
  });
  it("replaces an existing open", () => {
    expect(buildOpenQuery(new URLSearchParams("open=c1&q=acme"), "c2")).toBe("?open=c2&q=acme");
  });
  it("removes open and returns an empty string when nothing is left", () => {
    expect(buildOpenQuery(new URLSearchParams("open=c1"), null)).toBe("");
    expect(buildOpenQuery(new URLSearchParams("open=c1&q=acme"), null)).toBe("?q=acme");
  });
  it("encodes ids", () => {
    expect(buildOpenQuery(new URLSearchParams(), "a b&c")).toBe("?open=a+b%26c");
  });
});

describe("stepCursor", () => {
  const keys = ["a", "b", "c"];
  it("moves one row at a time", () => {
    expect(stepCursor(keys, "a", 1)).toBe("b");
    expect(stepCursor(keys, "c", -1)).toBe("b");
  });
  it("stops at the ends instead of wrapping", () => {
    expect(stepCursor(keys, "c", 1)).toBe("c");
    expect(stepCursor(keys, "a", -1)).toBe("a");
  });
  it("starts at the first row going forward and the last going back when there is no cursor", () => {
    expect(stepCursor(keys, null, 1)).toBe("a");
    expect(stepCursor(keys, undefined, -1)).toBe("c");
    expect(stepCursor(keys, "gone", 1)).toBe("a");
  });
  it("returns null for an empty list", () => {
    expect(stepCursor([], "a", 1)).toBeNull();
  });
});

describe("nextAfterRemoval", () => {
  it("goes to the row below, else the row above, else nothing", () => {
    expect(nextAfterRemoval(["a", "b", "c"], "b")).toBe("c");
    expect(nextAfterRemoval(["a", "b", "c"], "c")).toBe("b");
    expect(nextAfterRemoval(["a"], "a")).toBeNull();
    expect(nextAfterRemoval(["a", "b"], "zzz")).toBeNull();
  });
});

describe("crumbLabel", () => {
  it("shows the place and the position", () => {
    expect(crumbLabel("Approvals", ["a", "b", "c"], "a")).toBe("Approvals · 1 of 3");
    expect(crumbLabel("Companies", ["a", "b", "c"], "c")).toBe("Companies · 3 of 3");
  });
  it("shows only the place when the record is not in the list", () => {
    expect(crumbLabel("Companies", ["a"], "z")).toBe("Companies");
    expect(crumbLabel("Companies", ["a"], null)).toBe("Companies");
  });
});
