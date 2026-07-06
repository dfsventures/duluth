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
  it("falls back to DFS Lab defaults with no env vars set", async () => {
    const { ORG_NAME, ADMIN_EMAIL_DOMAIN } = await loadOrg();
    expect(ORG_NAME).toBe("DFS Lab");
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
