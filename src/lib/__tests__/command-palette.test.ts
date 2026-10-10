import { describe, it, expect } from "vitest";
import { buildPaletteItems, newUpdateItems, GROUP_ORDER, type SearchIndex } from "../command-palette";
import { ALL_ADMIN_PAGES } from "../admin-nav";

const ix: SearchIndex = {
  companies: [{ id: "c1", name: "AcmeHQ" }],
  funds: [{ id: "f1", name: "Fund 2" }],
  portfolioCompanies: [{ id: "p1", name: "AcmeHQ" }],
  lps: [{ id: "l1", name: "Sam Partner & Co" }],
};

describe("buildPaletteItems", () => {
  it("includes every admin page even before the index loads", () => {
    const items = buildPaletteItems(null);
    expect(items.filter((i) => i.group === "Go to")).toHaveLength(ALL_ADMIN_PAGES.length);
  });
  it("links each kind to its own route and keeps ids unique", () => {
    const items = buildPaletteItems(ix);
    const byId = Object.fromEntries(items.map((i) => [i.id, i.href]));
    expect(byId["company:c1"]).toBe("/admin/companies/c1");
    expect(byId["fund:f1"]).toBe("/admin/funds/f1");
    expect(byId["deal:p1"]).toBe("/admin/portfolio/p1");
    expect(byId["lp:l1"]).toBe("/admin/lps?q=Sam%20Partner%20%26%20Co");
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
  it("only uses groups the UI orders", () => {
    for (const i of buildPaletteItems(ix)) expect(GROUP_ORDER).toContain(i.group);
  });
});

describe("newUpdateItems", () => {
  it("stays hidden until the query asks for it", () => {
    expect(newUpdateItems(ix, "acme")).toEqual([]);
    expect(newUpdateItems(ix, "")).toEqual([]);
  });
  it("offers one per company when the query starts with new/add/write/update", () => {
    const out = newUpdateItems(ix, "new upd");
    expect(out).toHaveLength(1);
    expect(out[0].href).toBe("/admin/companies/c1/updates/new");
    expect(out[0].label).toBe("New update for AcmeHQ");
  });
});
