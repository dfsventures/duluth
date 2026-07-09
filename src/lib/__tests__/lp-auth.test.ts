import { describe, it, expect, vi, beforeEach } from "vitest";

// Part 7, WS18.6: pure decision logic (expiry check, attempt-cap check) is
// unit-testable independent of Next's cookies()/db, mirroring auth-guard.test.ts.
// Synthetic data only.

const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({ get: mockCookieGet }),
}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    lpSession: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

import {
  isSessionValid,
  isOtpUsable,
  getLp,
  OTP_MAX_ATTEMPTS,
} from "@/lib/lp-auth";

describe("isSessionValid", () => {
  const now = new Date("2026-07-09T00:00:00Z");

  it("is false for a missing session", () => {
    expect(isSessionValid(null, now)).toBe(false);
    expect(isSessionValid(undefined, now)).toBe(false);
  });

  it("is false once expiresAt has passed", () => {
    expect(isSessionValid({ expiresAt: new Date("2026-07-08T00:00:00Z") }, now)).toBe(false);
  });

  it("is true while expiresAt is in the future", () => {
    expect(isSessionValid({ expiresAt: new Date("2026-08-01T00:00:00Z") }, now)).toBe(true);
  });
});

describe("isOtpUsable", () => {
  const now = new Date("2026-07-09T00:00:00Z");
  const fresh = { expiresAt: new Date("2026-07-09T00:05:00Z"), consumedAt: null, attempts: 0 };

  it("is false for a missing OTP row", () => {
    expect(isOtpUsable(null, now)).toBe(false);
  });

  it("is false once consumed", () => {
    expect(isOtpUsable({ ...fresh, consumedAt: new Date() }, now)).toBe(false);
  });

  it("is false once expired", () => {
    expect(isOtpUsable({ ...fresh, expiresAt: new Date("2026-07-08T23:00:00Z") }, now)).toBe(false);
  });

  it("is true under the attempt cap", () => {
    expect(isOtpUsable({ ...fresh, attempts: OTP_MAX_ATTEMPTS }, now)).toBe(true);
  });

  it("is false once attempts exceed the fail-closed cap, independent of the (fail-open) rate limiter", () => {
    expect(isOtpUsable({ ...fresh, attempts: OTP_MAX_ATTEMPTS + 1 }, now)).toBe(false);
  });
});

describe("getLp", () => {
  beforeEach(() => {
    mockCookieGet.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("returns null when there is no cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);
    expect(await getLp()).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null for an expired session", async () => {
    mockCookieGet.mockReturnValue({ value: "expired-token" });
    mockFindUnique.mockResolvedValue({
      id: "sess-1",
      expiresAt: new Date(Date.now() - 1000),
      lastUsedAt: new Date(),
      lp: { id: "lp-1", email: "lp@example.com", name: "Test LP", funds: [{ fundId: "fund-1" }] },
    });
    expect(await getLp()).toBeNull();
  });

  it("returns the LP with fundIds for a valid session", async () => {
    mockCookieGet.mockReturnValue({ value: "good-token" });
    mockFindUnique.mockResolvedValue({
      id: "sess-1",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      lastUsedAt: new Date(),
      lp: {
        id: "lp-1",
        email: "lp@example.com",
        name: "Test LP",
        funds: [{ fundId: "fund-1" }, { fundId: "fund-2" }],
      },
    });

    const ctx = await getLp();
    expect(ctx).not.toBeNull();
    expect(ctx!.lp.email).toBe("lp@example.com");
    expect(ctx!.fundIds).toEqual(["fund-1", "fund-2"]);
  });
});
