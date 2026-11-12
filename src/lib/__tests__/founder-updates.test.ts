import { describe, it, expect } from "vitest";
import {
  PERIOD_RE,
  periodWindow,
  emailDateToInstant,
  valueSource,
  companyHasFounder,
  hasFounderWhere,
  websiteHost,
} from "@/lib/founder-updates";
import { formatPeriod } from "@/lib/utils";
import { nameTokens, tokensContain } from "@/lib/portco-match";

describe("periodWindow", () => {
  it("covers a full year", () => {
    const w = periodWindow("2025")!;
    expect(w.start.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });
  it("covers halves", () => {
    expect(periodWindow("2025-H1")!.end.toISOString()).toBe("2025-06-30T23:59:59.999Z");
    const h2 = periodWindow("2025-H2")!;
    expect(h2.start.toISOString()).toBe("2025-07-01T00:00:00.000Z");
    expect(h2.end.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });
  it("covers quarters", () => {
    expect(periodWindow("2025-Q1")!.end.toISOString()).toBe("2025-03-31T23:59:59.999Z");
    expect(periodWindow("2025-Q4")!.start.toISOString()).toBe("2025-10-01T00:00:00.000Z");
  });
  it("covers months incl. leap February and December", () => {
    expect(periodWindow("2024-02")!.end.toISOString()).toBe("2024-02-29T23:59:59.999Z");
    expect(periodWindow("2025-02")!.end.toISOString()).toBe("2025-02-28T23:59:59.999Z");
    const dec = periodWindow("2025-12")!;
    expect(dec.start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(dec.end.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });
  it("rejects malformed periods", () => {
    for (const p of ["2025-13", "2025-Q5", "Q3 2025", "2025-00", "2025-H3", "25", "", "2025-1"]) {
      expect(periodWindow(p)).toBeNull();
      expect(PERIOD_RE.test(p)).toBe(false);
    }
  });
});

describe("formatPeriod", () => {
  it("keeps the old outputs", () => {
    expect(formatPeriod("2025-Q1")).toBe("Q1 2025");
    expect(formatPeriod("2025-01")).toBe("Jan 2025");
    expect(formatPeriod("whatever")).toBe("whatever");
  });
  it("adds halves and bare years", () => {
    expect(formatPeriod("2025-H1")).toBe("H1 2025");
    expect(formatPeriod("2025-H2")).toBe("H2 2025");
    expect(formatPeriod("2025")).toBe("2025");
  });
});

describe("emailDateToInstant", () => {
  it("is 12:00 UTC", () => {
    expect(emailDateToInstant("2025-03-04").toISOString()).toBe("2025-03-04T12:00:00.000Z");
  });
});

describe("valueSource", () => {
  it("marge wins", () => {
    expect(valueSource({ via: "marge", enteredById: "a", updateCreatorIsAdmin: true })).toBe("marge");
  });
  it("admin when entered by an admin or the update's author is an admin", () => {
    expect(valueSource({ via: null, enteredById: "a", updateCreatorIsAdmin: false })).toBe("admin");
    expect(valueSource({ via: null, enteredById: null, updateCreatorIsAdmin: true })).toBe("admin");
  });
  it("founder otherwise, including legacy rows with no author", () => {
    expect(valueSource({ via: null, enteredById: null, updateCreatorIsAdmin: false })).toBe("founder");
    expect(valueSource({ via: null, enteredById: null, updateCreatorIsAdmin: null })).toBe("founder");
  });
});

describe("companyHasFounder", () => {
  it("is false with no members or only admins", () => {
    expect(companyHasFounder([])).toBe(false);
    expect(companyHasFounder([{ user: { roles: ["ADMIN"] } }])).toBe(false);
  });
  it("is true when any member is not an admin", () => {
    expect(companyHasFounder([{ user: { roles: ["ADMIN"] } }, { user: { roles: ["FOUNDER"] } }])).toBe(true);
  });
  it("exposes the matching where clause", () => {
    expect(hasFounderWhere.memberships.some.user.NOT.roles.has).toBe("ADMIN");
  });
});

describe("websiteHost", () => {
  it("normalises", () => {
    expect(websiteHost("https://www.Example.com/path?x=1")).toBe("example.com");
    expect(websiteHost("example.org")).toBe("example.org");
  });
  it("returns null when unusable", () => {
    expect(websiteHost(null)).toBeNull();
    expect(websiteHost("")).toBeNull();
    expect(websiteHost("not a url")).toBeNull();
    expect(websiteHost("localhost")).toBeNull();
  });
});

describe("portco-match exports", () => {
  it("exposes the token helpers", () => {
    expect(nameTokens("acme labs")).toEqual(["acme", "labs"]);
    expect(tokensContain(["acme"], ["acme", "labs"])).toBe(true);
  });
});
