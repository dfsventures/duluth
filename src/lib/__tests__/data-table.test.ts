import { describe, it, expect } from "vitest";
import {
  compareValues,
  sortRows,
  matchesQuery,
  parseTableState,
  buildTableQuery,
  nextSort,
  ariaSort,
  chipCounts,
  resultSummary,
} from "../data-table";

const opts = {
  sortKeys: ["name", "date"] as const,
  filterKeys: ["all", "behind", "current"] as const,
  defaultSort: { key: "date", dir: "desc" as const },
};

describe("compareValues", () => {
  it("sorts text A to Z, ignoring case", () => {
    expect(compareValues("alpha", "Beta", "asc")).toBeLessThan(0);
    expect(compareValues("alpha", "Beta", "desc")).toBeGreaterThan(0);
  });
  it("sorts numbers numerically, not as strings", () => {
    expect(compareValues(9, 10, "asc")).toBeLessThan(0);
  });
  it("keeps nulls last in both directions", () => {
    expect(compareValues(null, 5, "asc")).toBe(1);
    expect(compareValues(null, 5, "desc")).toBe(1);
    expect(compareValues(5, undefined, "desc")).toBe(-1);
    expect(compareValues(null, undefined, "asc")).toBe(0);
  });
  it("treats an empty string as blank", () => {
    expect(compareValues("", "a", "asc")).toBe(1);
  });
});

describe("sortRows", () => {
  it("does not mutate the input and is stable", () => {
    const rows = [
      { n: "b", g: 1 },
      { n: "a", g: 1 },
      { n: "c", g: 0 },
    ];
    const out = sortRows(rows, (r) => r.g, "asc");
    expect(out.map((r) => r.n)).toEqual(["c", "b", "a"]);
    expect(rows.map((r) => r.n)).toEqual(["b", "a", "c"]);
  });
});

describe("matchesQuery", () => {
  it("matches every word across fields", () => {
    expect(matchesQuery(["Acme Pay", "Fintech"], "acme fin")).toBe(true);
    expect(matchesQuery(["Acme Pay", "Fintech"], "acme health")).toBe(false);
  });
  it("matches everything for a blank query and ignores null fields", () => {
    expect(matchesQuery([null, undefined], "  ")).toBe(true);
    expect(matchesQuery([null], "x")).toBe(false);
  });
});

describe("parseTableState / buildTableQuery", () => {
  it("falls back to defaults for missing or unknown values", () => {
    const s = parseTableState(new URLSearchParams("filter=bogus&sort=nope"), opts);
    expect(s).toEqual({ q: "", filter: "all", sort: "date", dir: "desc" });
  });
  it("reads q, filter and a descending sort", () => {
    const s = parseTableState(new URLSearchParams("q=acme&filter=behind&sort=-name"), opts);
    expect(s).toEqual({ q: "acme", filter: "behind", sort: "name", dir: "desc" });
  });
  it("round-trips, and omits defaults", () => {
    const state = { q: "acme", filter: "behind", sort: "name", dir: "asc" as const };
    const qs = buildTableQuery(state, opts);
    expect(qs).toBe("?q=acme&filter=behind&sort=name");
    expect(parseTableState(new URLSearchParams(qs), opts)).toEqual(state);
    expect(buildTableQuery({ q: "", filter: "all", sort: "date", dir: "desc" }, opts)).toBe("");
  });
  it("preserves unrelated params such as ?tab=", () => {
    const qs = buildTableQuery({ q: "x", filter: "all", sort: "date", dir: "desc" }, opts, new URLSearchParams("tab=templates&q=old"));
    expect(qs).toBe("?tab=templates&q=x");
  });
  it("caps a very long q", () => {
    const s = parseTableState(new URLSearchParams("q=" + "a".repeat(500)), opts);
    expect(s.q.length).toBe(200);
  });
});

describe("nextSort / ariaSort", () => {
  it("flips the active column and starts a new one in its first direction", () => {
    expect(nextSort({ sort: "name", dir: "asc" }, "name")).toEqual({ sort: "name", dir: "desc" });
    expect(nextSort({ sort: "name", dir: "desc" }, "date", "desc")).toEqual({ sort: "date", dir: "desc" });
  });
  it("maps to aria-sort", () => {
    expect(ariaSort(false, "asc")).toBe("none");
    expect(ariaSort(true, "asc")).toBe("ascending");
    expect(ariaSort(true, "desc")).toBe("descending");
  });
});

describe("chipCounts / resultSummary", () => {
  it("counts each chip, all included", () => {
    const rows = [{ s: "a" }, { s: "b" }, { s: "a" }];
    const c = chipCounts(rows, [
      { key: "all", label: "All" },
      { key: "a", label: "A", test: (r) => r.s === "a" },
    ]);
    expect(c).toEqual({ all: 3, a: 2 });
  });
  it("words the summary", () => {
    expect(resultSummary(10, 10, "company", "companies")).toBe("10 companies");
    expect(resultSummary(3, 10, "company", "companies")).toBe("3 of 10 companies");
    expect(resultSummary(1, 1, "deal")).toBe("1 deal");
  });
});

import { groupRows, parseHiddenColumns, toggleHidden } from "@/lib/data-table";

describe("groupRows", () => {
  const rows = [
    { n: "b1", f: "Fund B" },
    { n: "a1", f: "Fund A" },
    { n: "b2", f: "Fund B" },
    { n: "a2", f: "Fund A" },
  ];
  it("orders groups by label and keeps incoming row order inside each", () => {
    const g = groupRows(rows, (r) => ({ id: r.f, label: r.f }));
    expect(g.map((x) => x.label)).toEqual(["Fund A", "Fund B"]);
    expect(g[0].rows.map((r) => r.n)).toEqual(["a1", "a2"]);
    expect(g[1].rows.map((r) => r.n)).toEqual(["b1", "b2"]);
  });
  it("returns no groups for no rows", () => {
    expect(groupRows([], () => ({ id: "x", label: "x" }))).toEqual([]);
  });
});

describe("hidden columns", () => {
  it("parses only known keys and survives garbage", () => {
    expect(parseHiddenColumns('["a","zzz"]', ["a", "b"])).toEqual(["a"]);
    expect(parseHiddenColumns("not json", ["a"])).toEqual([]);
    expect(parseHiddenColumns('{"a":1}', ["a"])).toEqual([]);
    expect(parseHiddenColumns(null, ["a"])).toEqual([]);
  });
  it("toggles", () => {
    expect(toggleHidden([], "a")).toEqual(["a"]);
    expect(toggleHidden(["a", "b"], "a")).toEqual(["b"]);
  });
});
