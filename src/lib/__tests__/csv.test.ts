import { describe, it, expect } from "vitest";
import { splitCsvLine, normalizeHeader, parseContactsCSV } from "@/lib/csv";

// Part 30, WS70.2 — the RFC4180-ish splitter that the existing companies
// importer's parseCSV lacks (it splits on bare commas and shifts columns
// on a quoted "Doe, Jane" cell). This module is used only by the new
// contacts importer; the companies importer is untouched.

describe("splitCsvLine", () => {
  it("splits bare (unquoted) fields on commas", () => {
    expect(splitCsvLine("Acme,Jane Doe,jane@acme.com,CEO")).toEqual([
      "Acme",
      "Jane Doe",
      "jane@acme.com",
      "CEO",
    ]);
  });

  it("keeps a comma inside a quoted field intact", () => {
    expect(splitCsvLine('Acme,"Doe, Jane",jane@acme.com,CEO')).toEqual([
      "Acme",
      "Doe, Jane",
      "jane@acme.com",
      "CEO",
    ]);
  });

  it('resolves "" inside a quoted field to a single literal quote', () => {
    expect(splitCsvLine('Acme,"5\'11"" tall",jane@acme.com,')).toEqual([
      "Acme",
      '5\'11" tall',
      "jane@acme.com",
      "",
    ]);
  });

  it("preserves a trailing empty field after a final comma", () => {
    expect(splitCsvLine("Acme,Jane,jane@acme.com,")).toEqual([
      "Acme",
      "Jane",
      "jane@acme.com",
      "",
    ]);
  });

  it("handles a lone trailing \\r (CRLF line endings split upstream)", () => {
    expect(splitCsvLine("Acme,Jane,jane@acme.com\r")).toEqual([
      "Acme",
      "Jane",
      "jane@acme.com\r",
    ]);
  });
});

describe("normalizeHeader", () => {
  it("strips a leading BOM, lowercases, trims, and drops surrounding quotes", () => {
    expect(normalizeHeader("﻿Company")).toBe("company");
    expect(normalizeHeader("  Email Address  ")).toBe("email address");
    expect(normalizeHeader('"Role"')).toBe("role");
    expect(normalizeHeader("'Name'")).toBe("name");
  });
});

describe("parseContactsCSV", () => {
  it("parses a portfolio-wide file with a quoted comma in the name column without shifting columns", () => {
    const csv = 'company,name,email,role\nAcme,"Doe, Jane",jane@acme.com,CEO\n';
    expect(parseContactsCSV(csv)).toEqual([
      { row: 2, company: "Acme", name: "Doe, Jane", email: "jane@acme.com", role: "CEO" },
    ]);
  });

  it("resolves header aliases (contact name, e-mail, title)", () => {
    const csv = "portfolio company,contact name,e-mail,title\nNorthwind,Bob,bob@nw.com,Finance\n";
    expect(parseContactsCSV(csv)).toEqual([
      { row: 2, company: "Northwind", name: "Bob", email: "bob@nw.com", role: "Finance" },
    ]);
  });

  it("returns [] when there is no email column", () => {
    expect(parseContactsCSV("company,name\nAcme,Jane\n")).toEqual([]);
  });

  it("supports a scoped two-column name,email file with no company column", () => {
    const csv = "name,email\nJane,jane@acme.com\n";
    expect(parseContactsCSV(csv)).toEqual([{ row: 2, company: undefined, name: "Jane", email: "jane@acme.com", role: undefined }]);
  });
});
