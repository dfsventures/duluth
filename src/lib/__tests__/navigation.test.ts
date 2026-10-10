import { describe, it, expect } from "vitest";
import { ADMIN_NAV_GROUPS, ALL_ADMIN_PAGES, gotoTargets } from "../admin-nav";
import { GOTO_WINDOW_MS, isPaletteShortcut, isTypingTarget, stepShortcut } from "../shortcuts";
import { parseTab, tabHref } from "../url-tab";

describe("admin nav data", () => {
  it("has unique hrefs and unique goto letters", () => {
    const hrefs = ALL_ADMIN_PAGES.map((p) => p.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const letters = ALL_ADMIN_PAGES.map((p) => p.goto).filter(Boolean);
    expect(new Set(letters).size).toBe(letters.length);
  });
  it("keeps the four groups and keeps goto letters off the shortcut keys", () => {
    expect(ADMIN_NAV_GROUPS.map((g) => g.label)).toEqual([
      "Company Operations",
      "Funds & LPs",
      "Team & Resources",
      "Admin Tools",
    ]);
    // g, j, k, ? and / are taken by other shortcuts.
    for (const k of Object.keys(gotoTargets())) expect(["g", "j", "k", "?", "/"]).not.toContain(k);
  });
  it("only points at /admin routes", () => {
    for (const p of ALL_ADMIN_PAGES) expect(p.href.startsWith("/admin")).toBe(true);
  });
});

describe("stepShortcut", () => {
  const idle = { armedAt: null };
  it("g then a letter goes to the page", () => {
    const a = stepShortcut(idle, "g", 1000);
    expect(a.result.type).toBe("armed");
    const b = stepShortcut(a.state, "c", 1500);
    expect(b.result).toEqual({ type: "goto", href: "/admin/companies" });
    expect(b.state.armedAt).toBeNull();
  });
  it("expires after the window", () => {
    const a = stepShortcut(idle, "g", 1000);
    const b = stepShortcut(a.state, "c", 1000 + GOTO_WINDOW_MS + 1);
    expect(b.result.type).toBe("none");
  });
  it("an unknown second key cancels, and g g re-arms", () => {
    const a = stepShortcut(idle, "g", 0);
    expect(stepShortcut(a.state, "z", 10).result.type).toBe("none");
    expect(stepShortcut(a.state, "g", 10).result.type).toBe("armed");
  });
  it("a bare letter does nothing, ? opens help", () => {
    expect(stepShortcut(idle, "c", 0).result.type).toBe("none");
    expect(stepShortcut(idle, "?", 0).result.type).toBe("help");
  });
});

describe("shortcut guards", () => {
  it("ignores typing targets and dialogs", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON", closest: () => ({}) })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON", closest: () => null })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
  it("recognises Ctrl/Cmd+K only", () => {
    expect(isPaletteShortcut({ key: "k", ctrlKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "K", metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "k" })).toBe(false);
    expect(isPaletteShortcut({ key: "k", ctrlKey: true, altKey: true })).toBe(false);
  });
});

describe("url tabs", () => {
  it("falls back for missing or unknown tabs", () => {
    expect(parseTab("metrics", ["updates", "metrics"] as const, "updates")).toBe("metrics");
    expect(parseTab("nope", ["updates", "metrics"] as const, "updates")).toBe("updates");
    expect(parseTab(null, ["updates", "metrics"] as const, "updates")).toBe("updates");
  });
  it("keeps the default tab's URL clean and other params intact", () => {
    expect(tabHref("/admin/funds/1", "", "deals", "deals")).toBe("/admin/funds/1");
    expect(tabHref("/admin/funds/1", "", "lps", "deals")).toBe("/admin/funds/1?tab=lps");
    expect(tabHref("/x", "tab=lps&foo=1", "deals", "deals")).toBe("/x?foo=1");
  });
});
