import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME;
const ORIGINAL_DOMAIN = process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN;

async function loadOrg() {
  vi.resetModules();
  const mod = await import("@/lib/org");
  return mod;
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_ORG_NAME;
  delete process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN;
});

afterEach(() => {
  if (ORIGINAL_ORG_NAME === undefined) delete process.env.NEXT_PUBLIC_ORG_NAME;
  else process.env.NEXT_PUBLIC_ORG_NAME = ORIGINAL_ORG_NAME;
  if (ORIGINAL_DOMAIN === undefined) delete process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN;
  else process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN = ORIGINAL_DOMAIN;
});

describe("org config defaults", () => {
  it("falls back to DFS defaults with no env vars set", async () => {
    const { ORG_NAME, ADMIN_EMAIL_DOMAIN } = await loadOrg();
    expect(ORG_NAME).toBe("DFS");
    expect(ADMIN_EMAIL_DOMAIN).toBe("dfs.vc");
  });
});

describe("ADMIN_EMAIL_DOMAIN normalization", () => {
  it("strips a leading @ if a fork's env var includes one", async () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN = "@acme.vc";
    const { ADMIN_EMAIL_DOMAIN } = await loadOrg();
    expect(ADMIN_EMAIL_DOMAIN).toBe("acme.vc");
  });

  it("leaves a domain with no leading @ unchanged", async () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN = "acme.vc";
    const { ADMIN_EMAIL_DOMAIN } = await loadOrg();
    expect(ADMIN_EMAIL_DOMAIN).toBe("acme.vc");
  });
});

describe("multiple admin domains", () => {
  it("parses a comma-separated list, trimming spaces and @, lowercasing", async () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN = "dfs.vc, @Example.ORG";
    const { ADMIN_EMAIL_DOMAINS, ADMIN_EMAIL_DOMAIN, ADMIN_EMAIL_DOMAINS_LABEL } = await loadOrg();
    expect(ADMIN_EMAIL_DOMAINS).toEqual(["dfs.vc", "example.org"]);
    expect(ADMIN_EMAIL_DOMAIN).toBe("dfs.vc");
    expect(ADMIN_EMAIL_DOMAINS_LABEL).toBe("@dfs.vc or @example.org");
  });

  it("isAdminEmailDomain accepts any listed domain, case-insensitively", async () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN = "dfs.vc,example.org";
    const { isAdminEmailDomain } = await loadOrg();
    expect(isAdminEmailDomain("a@dfs.vc")).toBe(true);
    expect(isAdminEmailDomain("a@Example.org")).toBe(true);
  });

  it("isAdminEmailDomain rejects lookalike and sub-domains", async () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN = "dfs.vc,example.org";
    const { isAdminEmailDomain } = await loadOrg();
    expect(isAdminEmailDomain("a@evildfs.vc")).toBe(false);
    expect(isAdminEmailDomain("a@mail.example.org")).toBe(false);
    expect(isAdminEmailDomain("a@example.org.evil.com")).toBe(false);
    expect(isAdminEmailDomain("no-at-sign")).toBe(false);
    expect(isAdminEmailDomain(null)).toBe(false);
  });

  it("defaults to a single domain with a single-domain label", async () => {
    const { ADMIN_EMAIL_DOMAINS, ADMIN_EMAIL_DOMAINS_LABEL } = await loadOrg();
    expect(ADMIN_EMAIL_DOMAINS).toEqual(["dfs.vc"]);
    expect(ADMIN_EMAIL_DOMAINS_LABEL).toBe("@dfs.vc");
  });
});
