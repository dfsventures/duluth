import { describe, it, expect } from "vitest";
import { resolveBroadcastRecipients, type BroadcastContactRow } from "@/lib/broadcast-recipients";

// Part 30, WS71 — pure dedup-by-email resolver. Synthetic data only
// (JC-BC-J). F51 found LP dedup structurally unnecessary; none of those
// guarantees hold here (multi-company targeting + per-company-unique
// contact emails per JC-BC-B), so this is the real thing.

describe("resolveBroadcastRecipients", () => {
  it("collapses the same address at two targeted companies into one recipient carrying both company names", () => {
    const rows: BroadcastContactRow[] = [
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-1", email: "founder@example.com", name: "Jane" } },
      { portfolioCompanyId: "pc-2", portfolioCompanyName: "Northwind", contact: { id: "c-2", email: "founder@example.com", name: "Jane" } },
    ];
    const result = resolveBroadcastRecipients(rows);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("founder@example.com");
    expect(result[0].portfolioCompanyIds).toEqual(["pc-1", "pc-2"]);
    expect(result[0].portfolioCompanyNames).toEqual(["Acme", "Northwind"]);
  });

  it("collapses case/whitespace variants of the same address to one normalized recipient", () => {
    const rows: BroadcastContactRow[] = [
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-1", email: " Founder@Example.com ", name: "Jane" } },
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-2", email: "founder@example.com", name: "Jane" } },
    ];
    const result = resolveBroadcastRecipients(rows);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("founder@example.com");
  });

  it("yields two recipients for two different addresses at one company", () => {
    const rows: BroadcastContactRow[] = [
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-1", email: "a@example.com", name: null } },
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-2", email: "b@example.com", name: null } },
    ];
    expect(resolveBroadcastRecipients(rows)).toHaveLength(2);
  });

  it("returns [] for empty input and never throws for a company with no contacts", () => {
    expect(resolveBroadcastRecipients([])).toEqual([]);
  });

  it("resolves a name from a later row when an earlier row for the same email has no name", () => {
    const rows: BroadcastContactRow[] = [
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-1", email: "a@example.com", name: null } },
      { portfolioCompanyId: "pc-2", portfolioCompanyName: "Northwind", contact: { id: "c-2", email: "a@example.com", name: "Jane" } },
    ];
    expect(resolveBroadcastRecipients(rows)[0].name).toBe("Jane");
  });

  it("drops a row whose normalized email is empty", () => {
    const rows: BroadcastContactRow[] = [
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-1", email: "   ", name: "Jane" } },
    ];
    expect(resolveBroadcastRecipients(rows)).toEqual([]);
  });

  it("produces byte-identical output (recipient order and per-recipient company-name order) regardless of input order", () => {
    const rowsA: BroadcastContactRow[] = [
      { portfolioCompanyId: "pc-2", portfolioCompanyName: "Zeta", contact: { id: "c-1", email: "b@example.com", name: "Bob" } },
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-2", email: "a@example.com", name: "Alice" } },
      { portfolioCompanyId: "pc-3", portfolioCompanyName: "Alpha", contact: { id: "c-3", email: "b@example.com", name: "Bob" } },
    ];
    const rowsB: BroadcastContactRow[] = [rowsA[2], rowsA[0], rowsA[1]];

    const resultA = resolveBroadcastRecipients(rowsA).map((r) => ({ email: r.email, names: r.portfolioCompanyNames }));
    const resultB = resolveBroadcastRecipients(rowsB).map((r) => ({ email: r.email, names: r.portfolioCompanyNames }));

    expect(resultA).toEqual(resultB);
    // Recipients sorted by email; company names sorted alphabetically within each recipient.
    expect(resultA.map((r) => r.email)).toEqual(["a@example.com", "b@example.com"]);
    expect(resultA.find((r) => r.email === "b@example.com")!.names).toEqual(["Alpha", "Zeta"]);
  });

  it("never filters by role/status/account — no User concept exists in this module (D4)", () => {
    // Type-level guard: BroadcastContactRow has no userId/role/status field at all.
    const rows: BroadcastContactRow[] = [
      { portfolioCompanyId: "pc-1", portfolioCompanyName: "Acme", contact: { id: "c-1", email: "a@example.com", name: null } },
    ];
    expect(resolveBroadcastRecipients(rows)).toHaveLength(1);
  });
});
