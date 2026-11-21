import { describe, it, expect } from "vitest";
import { ADMIN_NAV_GROUPS, ALL_ADMIN_PAGES, gotoTargets } from "../admin-nav";
import {
  ESC_ORDER,
  expandReturnHref,
  FILTER_PREFIX,
  GOTO_WINDOW_MS,
  isPaletteShortcut,
  isTopEscLayer,
  isTypingTarget,
  paletteKeyLabel,
  parseExpandReturn,
  readEscLayers,
  SHORTCUT_HELP,
  shortcutHelpRows,
  stepShortcut,
  topEscLayer,
} from "../shortcuts";
import { buildPaletteItems, filterListItems, parseFilterQuery } from "../command-palette";
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
  it("labels the palette key ⌘K on Apple devices and Ctrl K elsewhere", () => {
    expect(paletteKeyLabel("MacIntel")).toBe("⌘K");
    expect(paletteKeyLabel("macOS")).toBe("⌘K");
    expect(paletteKeyLabel("iPhone")).toBe("⌘K");
    expect(paletteKeyLabel("Win32")).toBe("Ctrl K");
    expect(paletteKeyLabel("Linux x86_64")).toBe("Ctrl K");
    expect(paletteKeyLabel("")).toBe("Ctrl K");
    expect(paletteKeyLabel(undefined)).toBe("Ctrl K");
  });
});

describe("f opens the palette on Filter: (WS164)", () => {
  const idle = { armedAt: null };
  it("a bare f asks for the filter palette", () => {
    expect(stepShortcut(idle, "f", 0)).toEqual({ state: { armedAt: null }, result: { type: "filter" } });
    expect(FILTER_PREFIX).toBe("Filter: ");
  });
  it("g then f still goes to Funds, not the filter", () => {
    const a = stepShortcut(idle, "g", 0);
    expect(stepShortcut(a.state, "f", 10).result).toEqual({ type: "goto", href: "/admin/funds" });
  });
  it("F with Shift is not f", () => {
    expect(stepShortcut(idle, "F", 0).result.type).toBe("none");
  });
  it("never fires while typing: the caller drops typing targets before stepShortcut", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(isTypingTarget({ tagName })).toBe(true);
    // The palette's own box is inside [cmdk-root], so a typed f stays in it.
    expect(isTypingTarget({ tagName: "DIV", closest: (s) => (s.includes("[cmdk-root]") ? {} : null) })).toBe(true);
  });
});

describe("layered Esc (WS164)", () => {
  it("closes in the planned order", () => {
    expect(ESC_ORDER).toEqual(["palette", "menu", "drawer", "full-page", "pane", "filters"]);
  });
  it("picks the top open layer, one at a time", () => {
    const all = { palette: true, menu: true, drawer: true, "full-page": true, pane: true, filters: true };
    expect(topEscLayer(all)).toBe("palette");
    expect(topEscLayer({ ...all, palette: false })).toBe("menu");
    expect(topEscLayer({ menu: false, drawer: true, pane: true, filters: true })).toBe("drawer");
    expect(topEscLayer({ "full-page": true, filters: true })).toBe("full-page");
    expect(topEscLayer({ pane: true, filters: true })).toBe("pane");
    expect(topEscLayer({ filters: true })).toBe("filters");
    expect(topEscLayer({})).toBeNull();
  });
  it("a layer handles Esc only when nothing above it is open", () => {
    expect(isTopEscLayer("pane", {})).toBe(true);
    expect(isTopEscLayer("pane", { filters: true })).toBe(true);
    expect(isTopEscLayer("pane", { drawer: true })).toBe(false);
    expect(isTopEscLayer("filters", { pane: true })).toBe(false);
    expect(isTopEscLayer("filters", { menu: true })).toBe(false);
    expect(isTopEscLayer("full-page", { palette: true })).toBe(false);
    expect(isTopEscLayer("full-page", { pane: true })).toBe(true);
  });
  it("reads open layers from the page, ignoring ones animating closed", () => {
    const doc = (present: string[]) => ({ querySelector: (s: string) => (present.some((p) => s.includes(p)) ? {} : null) });
    expect(readEscLayers(doc([]))).toEqual({ palette: false, menu: false, drawer: false, pane: false });
    expect(readEscLayers(doc(["[data-split-pane]"])).pane).toBe(true);
    expect(readEscLayers(doc(["[data-drawer-open]"])).drawer).toBe(true);
    expect(readEscLayers(doc(['[data-palette][data-state="open"]'])).palette).toBe(true);
    expect(readEscLayers(null)).toEqual({});
    // A real query: the palette is a dialog too, but it does not count as a drawer.
    const selectors: string[] = [];
    readEscLayers({ querySelector: (s: string) => (selectors.push(s), null) });
    expect(selectors.join(" ")).toContain(':not([data-palette])');
    expect(selectors.every((s) => !s.includes('role="menu"') || s.includes('[data-state="open"]'))).toBe(true);
  });
  it("Esc on a full page goes back to the list it was opened from, and only there", () => {
    const entry = { from: "/admin/companies?open=c1&q=acme", to: "/admin/companies/c1" };
    expect(expandReturnHref(entry, "/admin/companies/c1")).toBe("/admin/companies?open=c1&q=acme");
    expect(expandReturnHref(entry, "/admin/companies/c2")).toBeNull();
    expect(expandReturnHref({ from: "/admin/updates?open=u1", to: "/updates/u1?tab=x" }, "/updates/u1")).toBe("/admin/updates?open=u1");
    expect(expandReturnHref(null, "/admin/companies/c1")).toBeNull();
    // Never off the site.
    expect(expandReturnHref({ from: "https://example.com", to: "/x" }, "/x")).toBeNull();
    expect(expandReturnHref({ from: "//example.com", to: "/x" }, "/x")).toBeNull();
  });
  it("parses the stored entry defensively", () => {
    expect(parseExpandReturn('{"from":"/a?open=1","to":"/a/1"}')).toEqual({ from: "/a?open=1", to: "/a/1" });
    expect(parseExpandReturn("not json")).toBeNull();
    expect(parseExpandReturn('{"from":1}')).toBeNull();
    expect(parseExpandReturn(null)).toBeNull();
  });
});

describe("the ? sheet (WS164)", () => {
  it("lists the new keys under the new look only", () => {
    const v2 = shortcutHelpRows(true).map((r) => r.keys.join("+"));
    for (const k of ["Esc", "f", "a", "r", "d", "u"]) expect(v2).toContain(k);
    const v1 = shortcutHelpRows(false);
    expect(v1).toEqual(SHORTCUT_HELP.filter((r) => !r.newLookOnly));
    expect(v1.map((r) => r.keys.join("+"))).not.toContain("Esc");
    expect(v1.map((r) => r.keys.join("+"))).not.toContain("f");
  });
});

describe("palette actions (WS164)", () => {
  const index = { companies: [{ id: "c1", name: "Example Co" }], funds: [], portfolioCompanies: [], lps: [] };
  it("reads the text after Filter:", () => {
    expect(parseFilterQuery("Filter: acme")).toBe("acme");
    expect(parseFilterQuery("filter:acme ")).toBe("acme");
    expect(parseFilterQuery("Filter: ")).toBe("");
    expect(parseFilterQuery("acme")).toBeNull();
  });
  it("offers Filter only where the page has a list", () => {
    expect(filterListItems("Filter: acme", false)).toEqual([]);
    expect(filterListItems("", false)).toEqual([]);
  });
  it("offers a Filter this list action that prefills, then a filter item for the typed text", () => {
    const [prefill] = filterListItems("", true);
    expect(prefill.action).toBe("prefill-filter");
    const [by] = filterListItems("Filter: acme", true);
    expect(by).toMatchObject({ action: "filter-list", filterText: "acme", group: "Actions" });
    // The raw query is a keyword, so cmdk keeps the item whatever it scores.
    expect(by.keywords).toContain("Filter: acme");
    const [empty] = filterListItems("Filter: ", true);
    expect(empty.filterText).toBe("");
  });
  it("on Companies under the new look, a company opens in the pane", () => {
    const [c] = buildPaletteItems(index, "v2", "/admin/companies").filter((i) => i.group === "Companies");
    expect(c).toMatchObject({ label: "Open Example Co", action: "open-pane", openId: "c1", href: "" });
  });
  it("elsewhere, or under the old look, a company still goes to its page", () => {
    for (const [look, path] of [["v2", "/admin/funds"], ["v1", "/admin/companies"], ["v2", null]] as const) {
      const [c] = buildPaletteItems(index, look, path).filter((i) => i.group === "Companies");
      expect(c).toMatchObject({ label: "Example Co", href: "/admin/companies/c1" });
      expect(c.action).toBeUndefined();
    }
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
