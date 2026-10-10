import { describe, it, expect } from "vitest";
import { parseCompanyCsv } from "../company-csv";
import { tileTone } from "../status-tone";

describe("parseCompanyCsv", () => {
  it("reads name and url columns, in any order, with a BOM", () => {
    const rows = parseCompanyCsv('﻿url,Name\nhttps://a.example,"AcmeHQ"\n,Tidewater\n');
    expect(rows).toEqual([
      { name: "AcmeHQ", website: "https://a.example" },
      { name: "Tidewater", website: null },
    ]);
  });
  it("accepts the alternate header names", () => {
    expect(parseCompanyCsv("Company Name,Website URL\nKora,https://k.example")).toEqual([
      { name: "Kora", website: "https://k.example" },
    ]);
  });
  it("returns nothing without a name column or without data rows", () => {
    expect(parseCompanyCsv("url\nhttps://x.example")).toEqual([]);
    expect(parseCompanyCsv("name")).toEqual([]);
  });
  it("skips blank names", () => {
    expect(parseCompanyCsv("name\n\n  \nLumen")).toEqual([{ name: "Lumen", website: null }]);
  });
});

describe("tileTone", () => {
  it("is stable and case-insensitive", () => {
    expect(tileTone("AcmeHQ")).toBe(tileTone("  acmehq "));
  });
  it("only returns the four decorative tones", () => {
    for (const n of ["a", "bb", "Ridgeline Robotics", "", null, undefined]) {
      expect(["sand", "sky", "sage", "clay"]).toContain(tileTone(n));
    }
  });
});
