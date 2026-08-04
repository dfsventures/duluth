import { describe, it, expect } from "vitest";
import {
  SETUP_TOKEN_TTL_DAYS,
  generateSetupToken,
  isSetupTokenExpired,
  canResendSetupLink,
  canHardDeleteFromQueue,
} from "@/lib/setup-token";

describe("generateSetupToken", () => {
  it("produces a 64-char hex token", () => {
    const { token } = generateSetupToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expiry lands ~7 days out", () => {
    const before = Date.now();
    const { tokenExpiresAt } = generateSetupToken();
    const after = Date.now();
    const expectedMin = before + SETUP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    const expectedMax = after + SETUP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    expect(tokenExpiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(tokenExpiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});

describe("isSetupTokenExpired", () => {
  it("treats null expiry as expired (stricter of the two prior semantics)", () => {
    expect(isSetupTokenExpired({ tokenExpiresAt: null })).toBe(true);
  });

  it("treats a past expiry as expired", () => {
    expect(isSetupTokenExpired({ tokenExpiresAt: new Date(Date.now() - 1000) })).toBe(true);
  });

  it("treats a future expiry as valid", () => {
    expect(isSetupTokenExpired({ tokenExpiresAt: new Date(Date.now() + 1000) })).toBe(false);
  });
});

describe("canResendSetupLink", () => {
  it("PENDING + token + no password → eligible (the F19 population: admin-approved signup)", () => {
    expect(
      canResendSetupLink({ passwordHash: null, status: "PENDING", approvalToken: "tok" })
    ).toBe(true);
  });

  it("APPROVED + no password → eligible (invited user)", () => {
    expect(
      canResendSetupLink({ passwordHash: null, status: "APPROVED", approvalToken: null })
    ).toBe(true);
  });

  it("PENDING + no token → ineligible (still awaiting admin approval — must not bypass approval)", () => {
    expect(
      canResendSetupLink({ passwordHash: null, status: "PENDING", approvalToken: null })
    ).toBe(false);
  });

  it("REJECTED + token → ineligible (F20)", () => {
    expect(
      canResendSetupLink({ passwordHash: null, status: "REJECTED", approvalToken: "tok" })
    ).toBe(false);
  });

  it("any state with passwordHash set → ineligible (already active)", () => {
    expect(
      canResendSetupLink({ passwordHash: "hash", status: "APPROVED", approvalToken: "tok" })
    ).toBe(false);
    expect(
      canResendSetupLink({ passwordHash: "hash", status: "PENDING", approvalToken: null })
    ).toBe(false);
  });

  it("APPROVED + no token + no password → eligible (defensive)", () => {
    expect(
      canResendSetupLink({ passwordHash: null, status: "APPROVED", approvalToken: null })
    ).toBe(true);
  });
});

describe("canHardDeleteFromQueue", () => {
  it("admin → ineligible regardless of ownedCompanyCount", () => {
    expect(
      canHardDeleteFromQueue({ roles: ["ADMIN"], passwordHash: null }, 0)
    ).toBe(false);
    expect(
      canHardDeleteFromQueue({ roles: ["ADMIN", "FOUNDER"], passwordHash: null }, 0)
    ).toBe(false);
  });

  it("already has a password (finished setup) → ineligible", () => {
    expect(
      canHardDeleteFromQueue({ roles: ["FOUNDER"], passwordHash: "hash" }, 0)
    ).toBe(false);
  });

  it("owns a company (ownedCompanyCount > 0) → ineligible (F41 FK hazard)", () => {
    expect(
      canHardDeleteFromQueue({ roles: ["FOUNDER"], passwordHash: null }, 1)
    ).toBe(false);
  });

  it("plain invited/team-member row with no owned companies → eligible", () => {
    expect(
      canHardDeleteFromQueue({ roles: ["FOUNDER"], passwordHash: null }, 0)
    ).toBe(true);
  });
});
