import { describe, expect, it } from "vitest";
import {
  matchPortfolioCompanies,
  normalizeCompanyName,
  emailDomain,
  type PortcoCandidate,
} from "@/lib/portco-match";

// Part 31, WS75 — synthetic fixtures only (JC-LK-G): Acme, Northwind,
// founder@example.com. Never paste real portfolio names into this file.

function candidate(overrides: Partial<PortcoCandidate> & { id: string; name: string }): PortcoCandidate {
  return {
    companyId: null,
    contactEmails: [],
    ...overrides,
  };
}

describe("normalizeCompanyName", () => {
  it("lowercases, strips punctuation, collapses whitespace, and drops a trailing legal suffix", () => {
    expect(normalizeCompanyName("Acme, Inc.")).toBe("acme");
    expect(normalizeCompanyName("  Acme   Technologies  ")).toBe("acme technologies");
    expect(normalizeCompanyName("Northwind LLC")).toBe("northwind");
    expect(normalizeCompanyName("")).toBe("");
  });

  it("does not strip a suffix-looking token that is the whole name", () => {
    expect(normalizeCompanyName("Co")).toBe("co");
  });
});

describe("emailDomain", () => {
  it("returns the domain for a non-free-provider address", () => {
    expect(emailDomain("jane@acme.com")).toBe("acme.com");
  });

  it("returns null for free providers", () => {
    expect(emailDomain("jane@gmail.com")).toBeNull();
    expect(emailDomain("jane@yahoo.co.uk")).toBeNull();
  });

  it("returns null for blank/invalid input", () => {
    expect(emailDomain(null)).toBeNull();
    expect(emailDomain(undefined)).toBeNull();
    expect(emailDomain("")).toBeNull();
    expect(emailDomain("not-an-email")).toBeNull();
    expect(emailDomain("nodomain@")).toBeNull();
  });
});

describe("matchPortfolioCompanies", () => {
  it("1. normalized name equal (with legal suffix) -> STRONG / NAME_EXACT", () => {
    const candidates = [candidate({ id: "pc1", name: "Acme" })];
    const matches = matchPortfolioCompanies({ companyName: "Acme, Inc." }, candidates);
    expect(matches).toEqual([
      {
        portfolioCompanyId: "pc1",
        portfolioCompanyName: "Acme",
        tier: "STRONG",
        reasons: ["NAME_EXACT"],
        alreadyLinked: false,
      },
    ]);
  });

  it("2. contact-email exact match STRONG even when the typed name doesn't match (no demotion)", () => {
    const candidates = [
      candidate({ id: "pc1", name: "Acme", contactEmails: ["jane@acme.com"] }),
    ];
    const matches = matchPortfolioCompanies(
      { companyName: "Akme", signupEmail: "jane@acme.com" },
      candidates
    );
    expect(matches).toEqual([
      {
        portfolioCompanyId: "pc1",
        portfolioCompanyName: "Acme",
        tier: "STRONG",
        reasons: ["CONTACT_EMAIL"],
        alreadyLinked: false,
      },
    ]);
  });

  it("3. shared free-email-provider domain never produces EMAIL_DOMAIN", () => {
    const candidates = [
      candidate({ id: "pc1", name: "Northwind", contactEmails: ["bob@gmail.com"] }),
    ];
    const matches = matchPortfolioCompanies(
      { companyName: "Unrelated Widgets", signupEmail: "jane@gmail.com" },
      candidates
    );
    expect(matches).toEqual([]);
  });

  it("4. shared non-free email domain -> MEDIUM / EMAIL_DOMAIN", () => {
    const candidates = [
      candidate({ id: "pc1", name: "Acme", contactEmails: ["bob@acme.com"] }),
    ];
    const matches = matchPortfolioCompanies(
      { companyName: "Totally Different Co", signupEmail: "jane@acme.com" },
      candidates
    );
    expect(matches).toEqual([
      {
        portfolioCompanyId: "pc1",
        portfolioCompanyName: "Acme",
        tier: "MEDIUM",
        reasons: ["EMAIL_DOMAIN"],
        alreadyLinked: false,
      },
    ]);
  });

  it("5. Company.aliases entry normalizes equal -> STRONG / ALIAS_EXACT", () => {
    const candidates = [candidate({ id: "pc1", name: "Acme Technologies" })];
    const matches = matchPortfolioCompanies(
      { companyName: "Something Else", aliases: ["Acme Technologies"] },
      candidates
    );
    expect(matches).toEqual([
      {
        portfolioCompanyId: "pc1",
        portfolioCompanyName: "Acme Technologies",
        tier: "STRONG",
        reasons: ["ALIAS_EXACT"],
        alreadyLinked: false,
      },
    ]);
  });

  it("6. token containment after normalization -> WEAK / NAME_TOKENS", () => {
    const candidates = [candidate({ id: "pc1", name: "Acme Technologies" })];
    const matches = matchPortfolioCompanies({ companyName: "Acme" }, candidates);
    expect(matches).toEqual([
      {
        portfolioCompanyId: "pc1",
        portfolioCompanyName: "Acme Technologies",
        tier: "WEAK",
        reasons: ["NAME_TOKENS"],
        alreadyLinked: false,
      },
    ]);
  });

  it("7. an already-linked candidate is returned, flagged, not filtered out", () => {
    const candidates = [
      candidate({ id: "pc1", name: "Acme", companyId: "co-existing", contactEmails: ["jane@acme.com"] }),
    ];
    const matches = matchPortfolioCompanies(
      { companyName: "Acme", signupEmail: "jane@acme.com" },
      candidates
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].alreadyLinked).toBe(true);
  });

  it("8. empty name and no email -> []", () => {
    const candidates = [candidate({ id: "pc1", name: "Acme" })];
    expect(matchPortfolioCompanies({ companyName: "" }, candidates)).toEqual([]);
    expect(matchPortfolioCompanies({ companyName: "", signupEmail: null }, candidates)).toEqual([]);
  });

  it("9. two reasons on one candidate -> single entry, reasons deduped and sorted", () => {
    const candidates = [
      candidate({ id: "pc1", name: "Acme", contactEmails: ["jane@acme.com"] }),
    ];
    const matches = matchPortfolioCompanies(
      { companyName: "Acme", signupEmail: "jane@acme.com" },
      candidates
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].reasons).toEqual(["CONTACT_EMAIL", "NAME_EXACT"]);
    expect(matches[0].tier).toBe("STRONG");
  });

  it("10. ordering across all three tiers is exactly as specified", () => {
    const candidates = [
      // WEAK
      candidate({ id: "weak", name: "Acme Technologies" }),
      // MEDIUM
      candidate({ id: "medium", name: "Zephyr", contactEmails: ["bob@acme.com"] }),
      // STRONG (two reasons)
      candidate({ id: "strong-two", name: "Acme", contactEmails: ["jane@acme.com"] }),
      // STRONG (one reason) — name ties alphabetically after "Acme" alone would, use distinct name
      candidate({ id: "strong-one", name: "Acme Widgets", contactEmails: ["someone@acme.com"] }),
    ];
    const matches = matchPortfolioCompanies(
      { companyName: "Acme", signupEmail: "jane@acme.com" },
      candidates
    );
    // strong-two: CONTACT_EMAIL + NAME_TOKENS ("acme" token contained) -> 2 reasons, STRONG
    // strong-one: EMAIL_DOMAIN (acme.com) + NAME_TOKENS -> 2 reasons, but tier is STRONG only if
    // NAME_EXACT/ALIAS_EXACT/CONTACT_EMAIL present. EMAIL_DOMAIN+NAME_TOKENS best tier is MEDIUM.
    const ids = matches.map((m) => m.portfolioCompanyId);
    expect(ids).toEqual(["strong-two", "strong-one", "medium", "weak"]);
    expect(matches.map((m) => m.tier)).toEqual(["STRONG", "MEDIUM", "MEDIUM", "WEAK"]);
  });
});
